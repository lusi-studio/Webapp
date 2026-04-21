# Appluci Web - Migracion base

Base web en HTML/CSS/JS para migrar la app Android a una webapp responsive.

## Que incluye

- Autenticacion con Supabase REST (`signup` y `login`), equivalente al `AuthRepository`.
- Persistencia de sesion en `localStorage`.
- Navegacion por tabs: Inicio, Wallet, Promos y Perfil.
- Datos mock migrados desde `MockData.kt` a `data/mock-data.json`.

## Estructura

- `index.html`
- `css/styles.css`
- `js/app.js`
- `js/services/auth.js`
- `js/config.js`
- `data/mock-data.json`

## Como correrlo

Puedes abrir `index.html` directamente o levantar un server local para evitar problemas de CORS con JSON:

```bash
cd webapp-migracion
python3 -m http.server 8080
```

Luego abre:

<http://localhost:8080>

## Siguiente paso recomendado

1. Migrar a framework (React/Next/Vite) para escalar.
2. Separar cada pantalla en modulos.
3. Conectar transacciones/rewards reales desde Supabase tablas.
4. Añadir QR de membresia y notificaciones web.
