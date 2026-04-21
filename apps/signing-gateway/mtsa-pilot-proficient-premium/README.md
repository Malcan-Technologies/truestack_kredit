# Proficient Premium — MTSA pilot bundle

Trustgate **MTSAPilot.war** and **pilot** configuration for the **Proficient Premium** on-prem signing stack.

- **Demo / canary** continues to use `../mtsa-pilot/` (Andas Capital–named pilot files). Pushes to `main` that only touch this directory do **not** change the demo MTSA image.
- CI selects this directory when `signing.mtsa_build_context` is set in `config/clients/proficient-premium.yaml` (see `deploy-signing-gateway.yml`).

Do not rename `webapps/MTSAPilot.war` — the Docker build and Tomcat layout expect that filename.

Pilot bundles may contain Trustgate-issued credentials (same pattern as `../mtsa-pilot/` for demo). Treat as sensitive; rotate with Trustgate if credentials are ever exposed.
