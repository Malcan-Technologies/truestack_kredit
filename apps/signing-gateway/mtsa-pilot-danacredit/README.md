# Danacredit / K&B GLOBAL — MTSA pilot bundle

Trustgate **MTSAPilot.war** and **pilot** configuration for the **Danacredit** on-prem signing stack.

- **Demo / canary** uses `../mtsa-pilot/`. This directory is selected when `signing.mtsa_build_context` is set in `config/clients/danacredit.yaml` (see `deploy-signing-gateway.yml`).

Place the pilot WAR from Trustgate at **`webapps/MTSAPilot.war`** (create the `webapps` folder if needed). Do not rename the file — the Docker build and Tomcat layout expect that filename.

Treat pilot config and credentials as sensitive; rotate with Trustgate if exposed.
