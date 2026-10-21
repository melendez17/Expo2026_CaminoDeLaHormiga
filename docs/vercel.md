# Publicar la demo JSON en Vercel

La versión vigente está en la rama `implementacion-v0.1` de `melendez17/Expo2026_CaminoDeLaHormiga`.

El proyecto incluye `vercel.json` y Vercel detecta Next.js. No necesita variables de entorno, Supabase ni un servidor adicional. Los datos iniciales están en `public/data`; el progreso y los cambios del administrador permanecen en el navegador de cada dispositivo.

## Desde GitHub

1. En Vercel, selecciona **Add New → Project** e importa el repositorio.
2. Selecciona `implementacion-v0.1` como rama de producción. Si el asistente importa `main`, configura la rama de producción en los ajustes de Git del proyecto antes de publicar la demo.
3. Mantén la raíz del repositorio, framework Next.js, instalación `npm ci` y compilación `npm run build`. Publica con **Deploy**.
4. En **Deployment Protection**, comprueba que la URL de producción permita el acceso a las personas con quienes compartirás la demo.

## Desde la terminal

Desde la raíz del proyecto y en la rama `implementacion-v0.1`:

```bash
npx vercel login
npx vercel --prod
```

La autenticación se realiza en Vercel. No pegues contraseñas ni tokens en el repositorio. La carpeta local `.vercel/` está excluida de Git.

El enlace HTTPS permite probar login, mapa, retos, agenda y votos. Usa `K8P2` para Ana o `ADM1` para el administrador de prueba. El archivo del administrador sigue siendo una demo local: los datos y votos no se comparten entre navegadores.
