# Docker boundary

Starville does not need custom application images in Phase 1. Local Supabase uses its CLI-managed
containers. Production application Dockerfiles will be added only when deployment targets and image
requirements are selected; creating unused images now would add maintenance without validating a
real runtime.
