<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Li-Ion Manufacturing Process - Sistema MES

Aplicación web para gestión de procesos de manufactura de baterías Li-Ion.

View your app in AI Studio: https://ai.studio/apps/drive/1ojH2c4BnpWC6EmK5ovYUJeHd9eo51Twz

## 🚀 Ejecutar Localmente

**Requisitos previos:**  Node.js (v16 o superior)

### Instalación

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno:**
   - Configura `GEMINI_API_KEY` en el archivo `.env` con tu API key de Gemini

3. **Ejecutar la aplicación:**
   ```bash
   npm run dev
   ```
   La aplicación se ejecutará en `http://localhost:5173`

### Scripts Disponibles

- `npm run dev` - Inicia el servidor de desarrollo con hot reload
- `npm run build` - Compila la aplicación para producción
- `npm run preview` - Vista previa de la build de producción
- `npm run server` - Ejecuta el servidor backend Express

## 💻 Desarrollo en VSCode

### Ver Cambios Reflejados Automáticamente

Este proyecto está configurado con **Hot Module Replacement (HMR)** de Vite. Los cambios se reflejan automáticamente:

1. **Inicia el servidor de desarrollo:**
   ```bash
   npm run dev
   ```

2. **Edita cualquier archivo** `.tsx`, `.ts`, `.css` o `.html`

3. **Los cambios se reflejarán instantáneamente** en tu navegador sin necesidad de recargar la página

### Usar Tareas de VSCode

Puedes ejecutar el servidor de desarrollo directamente desde VSCode:

1. Presiona `Ctrl+Shift+P` (o `Cmd+Shift+P` en Mac)
2. Escribe "Tasks: Run Task"
3. Selecciona "Dev: Ejecutar servidor de desarrollo"

### Debugging

Para depurar la aplicación:

1. Inicia el servidor de desarrollo (`npm run dev`)
2. Ve a la pestaña "Run and Debug" en VSCode (Ctrl+Shift+D)
3. Selecciona "Debug: Chrome" y presiona F5
4. Esto abrirá Chrome con el debugger conectado

### Extensiones Recomendadas

Al abrir el proyecto en VSCode, se te recomendarán automáticamente las siguientes extensiones:

- **ESLint** - Linting de código
- **Prettier** - Formateo de código
- **ES7+ React/Redux Snippets** - Snippets para React
- **Tailwind CSS IntelliSense** - Autocompletado para Tailwind
- **TypeScript** - Soporte mejorado de TypeScript
- **Path Intellisense** - Autocompletado de rutas

## 🛠️ Tecnologías

- **React 18** - Framework UI
- **TypeScript** - Tipado estático
- **Vite** - Build tool y dev server
- **Tailwind CSS** - Estilos
- **React Router** - Enrutamiento
- **Express** - Servidor backend
- **MS SQL** - Base de datos
