# Pack de Contrato + Ejemplos — Document Publisher

## Estructura
- `contract/contract-m1.json`: contrato definitivo (DTO, enums, reglas, mapping).
- `contract/cover_placeholders_mapping.json`: mapeo de placeholders de portada → DTO.
- `examples/dto-s3.json`: ejemplo JSON usando `bodySource` (sin subir archivo).
- `examples/dto-multipart.json`: ejemplo JSON para flujo multipart (con `body.pdf`).
- `examples/body.pdf`: PDF cuerpo de ejemplo (pon cualquier PDF).
- `postman/DocumentPublisher.postman_collection.json`: colección para probar /health, /stamp, /publish.

## S3 (rutas y nombres)
- Troncales:
  - `Desarrollo/` → `bodies/` y `stamped/`
  - `Publicados/` → `official/`
- Clave compuesta:
  `{docId}-{semanticVersion}-{currentPhase}-{correlative}.pdf`
- Official:
  `Publicados/official/{docId}-{semanticVersion}.pdf`

## Estados/Etapas (resumen)
- Fases R-* → `stagePhase = "En Desarrollo"`
- Destino V-Test|V-Major|V-Minor|V-Patch → `Desarrollo` → `Vigente` tras publicar
- V-Deprecated → `Desarrollo` → `Sustituido`
- V-Cancelled → `En Desarrollo` → `Anulado`
- V-Obsolete → `En Desarrollo` → `Archivado`

## Probar con Postman
- Importa `postman/DocumentPublisher.postman_collection.json`
- `/health` → ok
- `/stamp` (JSON) → usa `examples/dto-s3.json` (variable `dto_s3_json`)
- `/publish` (multipart) → `dto-multipart.json` + `body.pdf`

## Notas
- Mantener **etiquetas en español** (enums) tal como el contrato.
- El microservicio debe resolver QR con `document.qr.baseUrl + code + semanticVersion`.
- Hash/TSA sólo para publicación final (V-*).
