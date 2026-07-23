# VALEJA × UNIBELL PROMOS

Aplicación React + Vite con registro, consulta, administración, sorteo y soporte PWA para promoción VALEJA × UNIBELL.

## Ejecutar localmente

```bash
npm install
npm run dev
```

## Build de producción

```bash
npm run build
```

## Publicación gratuita

### GitHub Pages

1. Asegúrate de que `vite.config.js` use `base: './'`.
2. Sube el proyecto a GitHub.
3. En GitHub, activa Pages sobre la rama `main`.
4. La app quedará disponible como PWA con rutas relativas.

### Firebase Hosting

1. Instala Firebase CLI:

```bash
npm install -g firebase-tools
```

2. Inicia sesión:

```bash
firebase login
```

3. Inicializa hosting:

```bash
firebase init hosting
```

4. Despliega:

```bash
firebase deploy
```

## PWA

La app incluye:
- `manifest.json`
- `service worker` para funcionamiento sin conexión
- iconos para Android e iPhone
- splash screen con los logos de VALEJA y UNIBELL
- opción de instalación desde el navegador: “Agregar a pantalla de inicio”
