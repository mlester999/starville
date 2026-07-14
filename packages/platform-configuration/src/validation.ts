import type { PlatformConfiguration, ValidationFinding, ValidationResult } from './contracts';
import { platformConfigurationSchema } from './contracts';
import { PLATFORM_MODULE_REGISTRY, PLATFORM_ROUTE_REGISTRY } from './registries';

export function moduleDependencyCycles(
  registry: Readonly<Record<string, { readonly dependencies: readonly string[] }>>,
): readonly string[] {
  const visited = new Set<string>();
  const active = new Set<string>();
  const cycles = new Set<string>();
  function visit(key: string) {
    if (active.has(key)) {
      cycles.add(key);
      return;
    }
    if (visited.has(key)) return;
    active.add(key);
    for (const dependency of registry[key]?.dependencies ?? []) visit(dependency);
    active.delete(key);
    visited.add(key);
  }
  for (const key of Object.keys(registry)) visit(key);
  return [...cycles].sort();
}

function linear(value: string): number {
  const channel = Number.parseInt(value, 16) / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground: string, background: string): number {
  const channels = (value: string) => [value.slice(1, 3), value.slice(3, 5), value.slice(5, 7)];
  const luminance = (value: string) => {
    const [red = '00', green = '00', blue = '00'] = channels(value);
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function finding(
  level: ValidationFinding['level'],
  code: string,
  path: string,
  message: string,
): ValidationFinding {
  return { level, code, path, message };
}

export function validatePlatformConfiguration(value: unknown): ValidationResult {
  const parsed = platformConfigurationSchema.safeParse(value);
  if (!parsed.success) {
    return {
      valid: false,
      findings: parsed.error.issues
        .slice(0, 100)
        .map((issue) =>
          finding(
            'blocking_error',
            'SCHEMA_INVALID',
            issue.path.join('.'),
            issue.message.replace(/[<>]/gu, ''),
          ),
        ),
    };
  }

  const configuration: PlatformConfiguration = parsed.data;
  const findings: ValidationFinding[] = [];
  const sectionKeys = configuration.landing.sections.map(({ key }) => key);
  const navigationKeys = configuration.navigation.items.map(({ routeKey }) => routeKey);
  const moduleSettings = new Map(configuration.modules.map((module) => [module.key, module]));

  if (new Set(sectionKeys).size !== sectionKeys.length) {
    findings.push(
      finding(
        'blocking_error',
        'LANDING_SECTION_DUPLICATE',
        'landing.sections',
        'Landing section keys must be unique.',
      ),
    );
  }
  if (
    new Set(configuration.landing.sections.map(({ order }) => order)).size !==
    configuration.landing.sections.length
  ) {
    findings.push(
      finding(
        'blocking_error',
        'LANDING_SECTION_ORDER_DUPLICATE',
        'landing.sections',
        'Landing section order values must be unique.',
      ),
    );
  }
  for (const requiredSection of ['hero', 'footer'] as const) {
    if (!configuration.landing.sections.some(({ key }) => key === requiredSection)) {
      findings.push(
        finding(
          'blocking_error',
          'LANDING_REQUIRED_SECTION_MISSING',
          `landing.sections.${requiredSection}`,
          `The ${requiredSection.replace('_', ' ')} section is required.`,
        ),
      );
    }
  }
  if (new Set(navigationKeys).size !== navigationKeys.length) {
    findings.push(
      finding(
        'blocking_error',
        'NAVIGATION_ROUTE_DUPLICATE',
        'navigation.items',
        'Navigation route keys must be unique.',
      ),
    );
  }
  if (
    new Set(configuration.navigation.items.map(({ order }) => order)).size !==
    configuration.navigation.items.length
  ) {
    findings.push(
      finding(
        'blocking_error',
        'NAVIGATION_ORDER_DUPLICATE',
        'navigation.items',
        'Navigation order values must be unique.',
      ),
    );
  }
  if (new Set(configuration.modules.map(({ key }) => key)).size !== configuration.modules.length) {
    findings.push(
      finding('blocking_error', 'MODULE_DUPLICATE', 'modules', 'Module keys must be unique.'),
    );
  }

  for (const cycle of moduleDependencyCycles(PLATFORM_MODULE_REGISTRY)) {
    findings.push(
      finding(
        'blocking_error',
        'MODULE_DEPENDENCY_CYCLE',
        `modules.${cycle}`,
        'The trusted module dependency registry contains a cycle.',
      ),
    );
  }

  for (const [key, definition] of Object.entries(PLATFORM_MODULE_REGISTRY)) {
    const setting = moduleSettings.get(key as keyof typeof PLATFORM_MODULE_REGISTRY);
    if (setting === undefined) {
      findings.push(
        finding(
          'blocking_error',
          'MODULE_MISSING',
          `modules.${key}`,
          'A registered module is missing.',
        ),
      );
      continue;
    }
    if (definition.required && !setting.enabled) {
      findings.push(
        finding(
          'blocking_error',
          'REQUIRED_MODULE_DISABLED',
          `modules.${key}`,
          'Required security modules cannot be disabled.',
        ),
      );
    }
    if (setting.enabled) {
      for (const dependency of definition.dependencies) {
        if (!moduleSettings.get(dependency as keyof typeof PLATFORM_MODULE_REGISTRY)?.enabled) {
          findings.push(
            finding(
              'blocking_error',
              'MODULE_DEPENDENCY_DISABLED',
              `modules.${key}`,
              `${definition.label} requires ${dependency.replaceAll('_', ' ')}.`,
            ),
          );
        }
      }
    }
  }

  for (const item of configuration.navigation.items) {
    const route = PLATFORM_ROUTE_REGISTRY[item.routeKey];
    if (route.module !== item.moduleKey) {
      findings.push(
        finding(
          'blocking_error',
          'NAVIGATION_MODULE_MISMATCH',
          `navigation.${item.routeKey}`,
          'Navigation routes must retain their registered module boundary.',
        ),
      );
    }
  }

  const contrasts = [
    [
      'TEXT_BACKGROUND_CONTRAST',
      'theme.tokens.textPrimary',
      configuration.theme.tokens.textPrimary,
      configuration.theme.tokens.background,
    ],
    [
      'TEXT_SURFACE_CONTRAST',
      'theme.tokens.textPrimary',
      configuration.theme.tokens.textPrimary,
      configuration.theme.tokens.surface,
    ],
    [
      'ACTION_CONTRAST',
      'theme.tokens.primaryActionText',
      configuration.theme.tokens.primaryActionText,
      configuration.theme.tokens.primaryAction,
    ],
  ] as const;
  for (const [code, path, foreground, background] of contrasts) {
    const ratio = contrastRatio(foreground, background);
    findings.push(
      ratio >= 4.5
        ? finding('passed', code, path, `Contrast passes at ${ratio.toFixed(2)} to 1.`)
        : finding(
            'blocking_error',
            code,
            path,
            `Contrast is ${ratio.toFixed(2)} to 1; at least 4.5 to 1 is required.`,
          ),
    );
  }

  const focusRatio = contrastRatio(
    configuration.theme.tokens.focusRing,
    configuration.theme.tokens.background,
  );
  findings.push(
    focusRatio >= 3
      ? finding(
          'passed',
          'FOCUS_RING_CONTRAST',
          'theme.tokens.focusRing',
          `Focus-ring contrast passes at ${focusRatio.toFixed(2)} to 1.`,
        )
      : finding(
          'blocking_error',
          'FOCUS_RING_CONTRAST',
          'theme.tokens.focusRing',
          `Focus-ring contrast is ${focusRatio.toFixed(2)} to 1; at least 3 to 1 is required.`,
        ),
  );

  if (configuration.branding.supportEmail === null) {
    findings.push(
      finding(
        'recommendation',
        'SUPPORT_EMAIL_RECOMMENDED',
        'branding.supportEmail',
        'Add a monitored support email before a production white-label launch.',
      ),
    );
  }

  if (findings.length === 0) {
    findings.push(finding('passed', 'CONFIGURATION_VALID', '', 'Configuration passed all checks.'));
  }
  return { valid: !findings.some(({ level }) => level === 'blocking_error'), findings };
}

export function isModuleEnabled(configuration: PlatformConfiguration, moduleKey: string): boolean {
  return configuration.modules.some((module) => module.key === moduleKey && module.enabled);
}
