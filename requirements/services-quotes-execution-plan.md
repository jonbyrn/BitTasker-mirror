# Plan de ejecución: Cotizaciones de servicios (Service quotes)

Complementa el plan principal `services-listing-feature-plan.md`. Enfoque: **recibir cotizaciones (taskee)** y **gestionar cotizaciones enviadas (tasker)** hasta la creación de contrato.

---

## 1. Tipos de cotización (quote request)

Toda solicitud que un **tasker** envía sobre un servicio es una **cotización**. El tipo depende del pricing del servicio:

| Tipo servicio   | Acción del tasker                                      | Payload de la cotización |
|-----------------|--------------------------------------------------------|---------------------------|
| **inquiry_required** | "Solicitar cotización" → modal con formulario de inquiry | `type: 'inquiry'`, `formResponses`, `message`, `photos` |
| **fixed**       | "Solicitar" / "Contratar" → confirmar precio + add-ons + rush (si aplica) | `type: 'fixed'`, `selectedAddOns`, `rushDelivery` |
| **hourly**      | Igual que fixed: add-ons + rush                        | `type: 'hourly'`, `selectedAddOns`, `rushDelivery` |
| **tiered**      | Seleccionar tier + add-ons + rush → "Solicitar"        | `type: 'tiered'`, `tierId`, `selectedAddOns`, `rushDelivery` |

- **inquiry_required**: ya existe flujo (Request Quote → modal inquiry → DM con `message_type: 'service_inquiry'`).
- **fixed / hourly / tiered**: añadir en la página del servicio (vista tasker) un CTA tipo "Solicitar" o "Contratar" que abra un paso de confirmación (tier si aplica, add-ons, rush) y al enviar cree una **cotización** con el mismo patrón de DM (tags + contenido JSON), pero con `message_type: 'service_quote_request'` y payload con `pricingType`, `tierId` (si tiered), `selectedAddOns`, `rushDelivery`, etc.

---

## 2. Panel Taskee: My Services → Ver cotizaciones

### 2.1 Cambios en My Services

- **Componente:** `DashboardMyServicesPanel.svelte`
- **Nuevo botón por servicio:** "Ver cotizaciones" (junto a Ver / Editar).
- **Acción:** Navegar a una vista de cotizaciones de ese servicio (reutilizando patrón de "bids por tarea").

### 2.2 Ruta o vista de cotizaciones por servicio

- **Opciones:**
  - **A)** Ruta dedicada: `/dashboard/service/[serviceId]/inquiries` (o `/quotes`) que muestre solo las cotizaciones de ese servicio.
  - **B)** Drawer/panel en el dashboard (como en Tasks con pestaña "bids") que al hacer clic en "Ver cotizaciones" abra el panel de cotizaciones del servicio seleccionado.

Recomendación: **A)** para mantener consistencia con el plan actual (`service/[serviceId]/inquiries`).

### 2.3 Contenido de la vista (taskee)

- **Reutilizar:** patrón de `BidsPanel.svelte` / `DashboardBidsPanel.svelte` pero para **cotizaciones recibidas** (inquiries + quote requests fixed/tiered/hourly).
- **Lista:** cards de cotización con:
  - Tasker (nombre, avatar).
  - Fecha.
  - Tipo: "Formulario de consulta" vs "Solicitud con tier/precio fijo".
  - Resumen: respuestas del formulario (inquiry) o tier/precio seleccionado (fixed/tiered/hourly).
- **Drawer de detalle** (reutilizar patrón `BidDetailsDrawer.svelte`):
  - Datos completos de la cotización.
  - **Acciones taskee:**
    1. **Rechazar:** marcar cotización como rechazada y opcionalmente notificar.
    2. **Hacer oferta:** abrir formulario de oferta (propuesta de precio/plazo).

### 2.4 Formulario "Hacer oferta" (taskee)

- **Reutilizar:** mismo componente que en Find task cuando el taskee hace una oferta sobre una tarea (`BidForm.svelte`) o el ya previsto `ServiceProposalForm.svelte`.
- **Diferencia:** aquí la oferta es del **taskee hacia la cotización** que envió el tasker (monto, tipo pago FIXED/HOURLY, descripción, duración, etc.).
- **Envío:** evento tipo bid/proposal con tags `service`, `inquiry_id` o `quote_request_id`, `message_type: 'proposal'`, etc., y DM al tasker.

---

## 3. Panel Tasker: Nueva pestaña "Mis cotizaciones"

### 3.1 Dashboard

- **Archivo:** `src/routes/(protected)/dashboard/+page.svelte`
- **Nueva pestaña:** "Mis cotizaciones" (ej. `id: 'my-quotes'`).
- **Contenido:** listado de **cotizaciones que yo (tasker) he enviado** (inquiries + quote requests de servicios fixed/tiered/hourly).

### 3.2 Listado "Mis cotizaciones"

- **Fuente de datos:** DMs o eventos de tipo inquiry/quote_request donde yo soy el autor (tasker) y el destinatario es el taskee del servicio.
- **Card por cotización:**
  - Servicio (título, enlace).
  - Taskee (nombre, avatar).
  - Fecha.
  - Estado: pendiente, respondida (con oferta), rechazada, aceptada (contrato creado).
  - Si hay oferta del taskee: monto, descripción breve.

### 3.3 Acciones del tasker por cotización

- **Eliminar:** retirar o archivar la cotización (no elimina el DM; solo marca en UI o en tags como "cancelada" por el tasker).
- **Aceptar oferta:** si el taskee ya envió una oferta (proposal), botón "Aceptar oferta" que dispara el **flujo de creación de contrato** (solo el tasker puede crear el contrato, igual que en tasks).

### 3.4 Flujo "Aceptar oferta" → Contrato

- **Reutilizar:** lógica de `BidAcceptanceForm.svelte` / `acceptBidAndCreateEscrow` pero con contexto de **servicio** (serviceId, proposal event, etc.).
- **Pasos:**
  1. Tasker hace clic en "Aceptar oferta" en una cotización que tiene proposal.
  2. Se abre el flujo de aceptación (modal/página) con resumen: monto, taskee, servicio, fechas estimadas.
  3. **Validaciones previas** (como en el plan principal):
     - Comprobar última versión del servicio (por `d` tag) antes de crear escrow.
     - Servicio activo, precios coherentes con la oferta.
  4. Tasker confirma y se llama a la creación de escrow/contrato (adaptar `acceptBidAndCreateEscrow` o equivalente para propuestas de servicio).
  5. Tras éxito: contrato creado, estado de la cotización/proposal a "accepted".

---

## 4. Servicio con fixed / tiered (vista tasker): crear cotización

### 4.1 Página de detalle del servicio

- **Componente:** `ServiceDetailsView.svelte` (y/o página pública del servicio).
- **Para pricing fixed / hourly / tiered:** además de "Contactar", mostrar botón principal tipo **"Solicitar"** o **"Contratar"**.

### 4.2 Flujo "Solicitar" (fixed / hourly / tiered)

- **Tiered:** el tasker ya tiene el tier elegido en el selector; opcionalmente add-ons y rush. Botón "Solicitar" → confirmación (resumen: tier, add-ons, total) → enviar.
- **Fixed / Hourly:** selector de add-ons y rush si aplica → "Solicitar" → confirmación → enviar.
- **Envío:** crear evento/DM de cotización con:
  - `message_type: 'service_quote_request'` (o tag equivalente).
  - Payload: `pricingType`, `tierId` (si tiered), `selectedAddOns`, `rushDelivery`, `serviceId`, `taskerNpub`, etc.
- Misma capa de notificación/inbox que las inquiries para que el taskee vea la solicitud en "Ver cotizaciones".

### 4.3 Reutilización del componente de creación de servicio

- Revisar `ServiceTierSelector.svelte`, `ServiceAddOnsSelector.svelte` y la lógica en `ServicePricing.svelte` / steps de list-service para:
  - Mostrar en la vista pública el mismo selector de tier y add-ons.
  - Calcular total (tier o fixed + add-ons + rush) y pasarlo al payload de la cotización al hacer "Solicitar".

---

## 5. Resumen de componentes y rutas

| Elemento | Acción |
|----------|--------|
| `DashboardMyServicesPanel.svelte` | Añadir botón "Ver cotizaciones" por servicio → enlace a `/dashboard/service/[serviceId]/inquiries` (o nombre elegido). |
| Nueva ruta `dashboard/service/[serviceId]/inquiries` | Página con lista de cotizaciones del servicio + drawer detalle; acciones Rechazar / Hacer oferta. |
| Componente lista cotizaciones | Nuevo o adaptar `BidsPanel` → `ServiceQuotesPanel.svelte` (cotizaciones recibidas por servicio). |
| Componente detalle cotización | Nuevo o adaptar `BidDetailsDrawer` → `ServiceQuoteDetailsDrawer.svelte`. |
| Formulario oferta (taskee) | Reutilizar `BidForm.svelte` o `ServiceProposalForm.svelte` (oferta del taskee al tasker). |
| Dashboard `+page.svelte` | Nueva pestaña "Mis cotizaciones". |
| Nueva ruta o panel "Mis cotizaciones" | Listado de cotizaciones enviadas por el tasker; acciones Eliminar / Aceptar oferta. |
| Aceptar oferta (tasker) | Reutilizar flujo `BidAcceptanceForm` + `acceptBidAndCreateEscrow` adaptado a servicio/proposal. |
| `ServiceDetailsView.svelte` | Para fixed/tiered/hourly: botón "Solicitar" + flujo de confirmación (tier, add-ons, rush) y envío de cotización. |

---

## 6. Tipos de evento / tags (recordatorio)

- **Cotización (tasker → taskee):**
  - Inquiry: ya definido (`message_type: 'service_inquiry'`, etc.).
  - Quote request (fixed/tiered/hourly): `message_type: 'service_quote_request'`, payload con `pricingType`, `tierId`, `selectedAddOns`, `rushDelivery`, `serviceId`, etc.
- **Propuesta (taskee → tasker):** reutilizar estructura de bids con `message_type: 'proposal'`, tags `service`, `inquiry_id` o `quote_request_id`, y contenido tipo bid (amount, payment type, description, etc.).

---

## 7. Orden sugerido de implementación

1. **Tipos y utilidades:** definir tipo `ServiceQuoteRequest` (inquiry vs fixed/hourly/tiered) y helpers para parsear/crear DMs de cotización.
2. **Taskee – Ver cotizaciones:** botón en My Services + ruta `dashboard/service/[serviceId]/inquiries` + lista + drawer + acciones Rechazar / Hacer oferta (con formulario reutilizado).
3. **Tasker – Mis cotizaciones:** pestaña en dashboard + listado de cotizaciones enviadas + Eliminar + Aceptar oferta con flujo de contrato.
4. **Fixed/tiered/hourly – Solicitar:** en `ServiceDetailsView`, botón "Solicitar" + flujo de confirmación (tier, add-ons, rush) + envío de quote request.
5. **Integración contrato:** conectar "Aceptar oferta" (tasker) con la creación de escrow/contrato (adaptar `acceptBidAndCreateEscrow` o equivalente para propuestas de servicio).
6. **Traducciones y pruebas:** claves i18n para "Ver cotizaciones", "Mis cotizaciones", "Solicitar", "Rechazar", "Hacer oferta", "Aceptar oferta", "Eliminar"; pruebas E2E por tipo de cotización.

---

Este plan se integra con la sección 4.6.3 (Create Service Inquiry Management) y la propuesta de reutilización de `BidForm`/`BidsPanel`/`BidDetailsDrawer`/`BidAcceptanceForm` del documento principal.
