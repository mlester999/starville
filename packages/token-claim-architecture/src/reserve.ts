import { z } from 'zod';

import {
  fromBaseUnits,
  lamportsSchema,
  MAX_TOKEN_BASE_UNITS,
  nonnegativeTokenBaseUnitsSchema,
  tokenBaseUnitsSchema,
  toBaseUnits,
} from './common';

export const treasuryReserveFixtureSchema = z
  .object({
    fixtureTokenBalanceBaseUnits: nonnegativeTokenBaseUnitsSchema,
    fixtureSolFeeBalanceLamports: lamportsSchema,
    minimumTokenReserveBaseUnits: nonnegativeTokenBaseUnitsSchema,
    minimumSolReserveLamports: lamportsSchema,
    authorizedUnclaimedBaseUnits: nonnegativeTokenBaseUnitsSchema,
    pendingOperationBaseUnits: nonnegativeTokenBaseUnitsSchema,
    confirmedOutgoingBaseUnits: nonnegativeTokenBaseUnitsSchema,
    failedOperationReleasedBaseUnits: nonnegativeTokenBaseUnitsSchema,
    pendingFeeReserveLamports: lamportsSchema,
    confirmedFeeSpendLamports: lamportsSchema,
    safetyBufferBaseUnits: nonnegativeTokenBaseUnitsSchema,
    label: z.literal('FIXTURE — NOT A LIVE TREASURY BALANCE'),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      toBaseUnits(value.confirmedOutgoingBaseUnits) >
      toBaseUnits(value.fixtureTokenBalanceBaseUnits)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['confirmedOutgoingBaseUnits'],
        message: 'Fixture confirmed outgoing cannot exceed the fixture starting balance.',
      });
    }
    if (BigInt(value.confirmedFeeSpendLamports) > BigInt(value.fixtureSolFeeBalanceLamports)) {
      context.addIssue({
        code: 'custom',
        path: ['confirmedFeeSpendLamports'],
        message: 'Fixture fee spend cannot exceed the fixture starting fee balance.',
      });
    }
    const reservations =
      toBaseUnits(value.authorizedUnclaimedBaseUnits) +
      toBaseUnits(value.pendingOperationBaseUnits);
    if (toBaseUnits(value.failedOperationReleasedBaseUnits) > reservations) {
      context.addIssue({
        code: 'custom',
        path: ['failedOperationReleasedBaseUnits'],
        message: 'Released fixture reservations cannot exceed reserved liability.',
      });
    }
    const protectedTotal =
      toBaseUnits(value.minimumTokenReserveBaseUnits) +
      toBaseUnits(value.safetyBufferBaseUnits) +
      reservations;
    if (protectedTotal > MAX_TOKEN_BASE_UNITS) {
      context.addIssue({
        code: 'custom',
        path: ['minimumTokenReserveBaseUnits'],
        message: 'Aggregate fixture token protection exceeds the bounded base-unit range.',
      });
    }
  });
export type TreasuryReserveFixture = z.infer<typeof treasuryReserveFixtureSchema>;

export const treasuryReserveResultSchema = z
  .object({
    mode: z.literal('offline_fixture'),
    currentFixtureTokenBalanceBaseUnits: nonnegativeTokenBaseUnitsSchema,
    currentFixtureFeeBalanceLamports: lamportsSchema,
    reservedLiabilityBaseUnits: nonnegativeTokenBaseUnitsSchema,
    protectedTokenAmountBaseUnits: nonnegativeTokenBaseUnitsSchema,
    protectedFeeAmountLamports: lamportsSchema,
    availableAuthorizationBaseUnits: nonnegativeTokenBaseUnitsSchema,
    availableFeeReserveLamports: lamportsSchema,
    canAuthorizeRequestedAmount: z.boolean(),
    rejectionReasons: z.array(
      z.enum(['token_reserve_conflict', 'fee_reserve_conflict', 'invalid_fixture']),
    ),
    requestedAmountBaseUnits: nonnegativeTokenBaseUnitsSchema,
    requestedFeeLamports: lamportsSchema,
    fixtureOnly: z.literal(true),
  })
  .strict();
export type TreasuryReserveResult = z.infer<typeof treasuryReserveResultSchema>;

function floorZero(value: bigint): bigint {
  return value > 0n ? value : 0n;
}

export function calculateTreasuryReserve(
  rawFixture: TreasuryReserveFixture,
  rawRequestedAmountBaseUnits: string = '0',
  rawRequestedFeeLamports: string = '0',
): TreasuryReserveResult {
  const fixture = treasuryReserveFixtureSchema.parse(rawFixture);
  const requestedAmount = toBaseUnits(
    nonnegativeTokenBaseUnitsSchema.parse(rawRequestedAmountBaseUnits),
  );
  const requestedFee = BigInt(lamportsSchema.parse(rawRequestedFeeLamports));
  const currentToken =
    toBaseUnits(fixture.fixtureTokenBalanceBaseUnits) -
    toBaseUnits(fixture.confirmedOutgoingBaseUnits);
  const currentFee =
    BigInt(fixture.fixtureSolFeeBalanceLamports) - BigInt(fixture.confirmedFeeSpendLamports);
  const reservedLiability = floorZero(
    toBaseUnits(fixture.authorizedUnclaimedBaseUnits) +
      toBaseUnits(fixture.pendingOperationBaseUnits) -
      toBaseUnits(fixture.failedOperationReleasedBaseUnits),
  );
  const protectedToken =
    toBaseUnits(fixture.minimumTokenReserveBaseUnits) +
    toBaseUnits(fixture.safetyBufferBaseUnits) +
    reservedLiability;
  const protectedFee =
    BigInt(fixture.minimumSolReserveLamports) + BigInt(fixture.pendingFeeReserveLamports);
  const availableToken = floorZero(currentToken - protectedToken);
  const availableFee = floorZero(currentFee - protectedFee);
  const rejectionReasons: TreasuryReserveResult['rejectionReasons'][number][] = [];
  if (requestedAmount > availableToken) rejectionReasons.push('token_reserve_conflict');
  if (requestedFee > availableFee) rejectionReasons.push('fee_reserve_conflict');

  return treasuryReserveResultSchema.parse({
    mode: 'offline_fixture',
    currentFixtureTokenBalanceBaseUnits: fromBaseUnits(currentToken),
    currentFixtureFeeBalanceLamports: currentFee.toString(),
    reservedLiabilityBaseUnits: fromBaseUnits(reservedLiability),
    protectedTokenAmountBaseUnits: fromBaseUnits(protectedToken),
    protectedFeeAmountLamports: protectedFee.toString(),
    availableAuthorizationBaseUnits: fromBaseUnits(availableToken),
    availableFeeReserveLamports: availableFee.toString(),
    canAuthorizeRequestedAmount: rejectionReasons.length === 0,
    rejectionReasons,
    requestedAmountBaseUnits: requestedAmount.toString(),
    requestedFeeLamports: requestedFee.toString(),
    fixtureOnly: true,
  });
}

export function reserveFixtureWithAuthorization(
  rawFixture: TreasuryReserveFixture,
  amountBaseUnits: string,
): TreasuryReserveFixture {
  const fixture = treasuryReserveFixtureSchema.parse(rawFixture);
  const amount = toBaseUnits(tokenBaseUnitsSchema.parse(amountBaseUnits));
  const reserve = calculateTreasuryReserve(fixture, amount.toString());
  if (!reserve.canAuthorizeRequestedAmount) throw new Error('TREASURY_RESERVE_CONFLICT');
  return treasuryReserveFixtureSchema.parse({
    ...fixture,
    authorizedUnclaimedBaseUnits: (
      toBaseUnits(fixture.authorizedUnclaimedBaseUnits) + amount
    ).toString(),
  });
}

export function releaseFixtureAuthorization(
  rawFixture: TreasuryReserveFixture,
  amountBaseUnits: string,
): TreasuryReserveFixture {
  const fixture = treasuryReserveFixtureSchema.parse(rawFixture);
  const amount = toBaseUnits(tokenBaseUnitsSchema.parse(amountBaseUnits));
  const current = toBaseUnits(fixture.authorizedUnclaimedBaseUnits);
  if (amount > current) throw new Error('FIXTURE_RESERVE_RELEASE_EXCEEDS_AUTHORIZATION');
  return treasuryReserveFixtureSchema.parse({
    ...fixture,
    authorizedUnclaimedBaseUnits: (current - amount).toString(),
  });
}
