# Guía de Desarrollo en VSCode

Esta guía te ayudará a ver los cambios reflejados automáticamente mientras desarrollas en Visual Studio Code.

## 🎯 Configuración Inicial

### 1. Instalar Extensiones Recomendadas

Al abrir el proyecto en VSCode por primera vez, verás una notificación para instalar extensiones recomendadas. Haz clic en "Instalar" o instálalas manualmente:

- ESLint
- Prettier - Code formatter
- ES7+ React/Redux/React-Native snippets
- Tailwind CSS IntelliSense
- TypeScript Vue Plugin (Volar)
- Path Intellisense
- IntelliCode

### 2. Configuración Automática

El proyecto incluye configuraciones predefinidas en `.vscode/`:

- **settings.json** - Formatea código automáticamente al guardar
- **tasks.json** - Tareas para ejecutar comandos npm
- **launch.json** - Configuración de debugging
- **extensions.json** - Extensiones recomendadas

## 🔄 Ver Cambios en Tiempo Real

### Método 1: Usando la Terminal

1. Abre la terminal integrada en VSCode (`Ctrl+ñ` o `View > Terminal`)
2. Ejecuta:
   ```bash
   npm run dev
   ```
3. Abre tu navegador en `http://localhost:5173`
4. **¡Listo!** Ahora cualquier cambio que hagas se reflejará automáticamente

### Método 2: Usando Tareas de VSCode (Recomendado)

1. Presiona `Ctrl+Shift+P` (Windows/Linux) o `Cmd+Shift+P` (Mac)
2. Escribe: `Tasks: Run Task`
3. Selecciona: `Dev: Ejecutar servidor de desarrollo`
4. El servidor se iniciará en una nueva terminal

### Método 3: Atajo de Teclado

1. Presiona `Ctrl+Shift+B` para ejecutar la tarea de build por defecto
2. Esto iniciará automáticamente el servidor de desarrollo

## 🐛 Depuración (Debugging)

### Depurar el Frontend (React)

1. Asegúrate de que el servidor de desarrollo esté corriendo (`npm run dev`)
2. Ve a la pestaña "Run and Debug" (Ctrl+Shift+D)
3. Selecciona "Debug: Chrome" en el dropdown
4. Presiona F5 o haz clic en el botón verde "Start Debugging"
5. Se abrirá Chrome con las herramientas de desarrollo conectadas

Ahora puedes:
- Colocar breakpoints en tu código TypeScript/React
- Inspeccionar variables
- Ver el call stack
- Usar la consola de debug

### Depurar el Backend (Express)

1. Ve a la pestaña "Run and Debug"
2. Selecciona "Debug: Servidor Backend"
3. Presiona F5
4. El servidor backend se iniciará en modo debug

### Debug Full Stack

Para depurar frontend y backend simultáneamente:
1. Selecciona "Debug: Full Stack"
2. Presiona F5
3. Ambos debuggers se iniciarán

## 📝 Flujo de Trabajo Recomendado

1. **Inicia el servidor de desarrollo** (Método 2 o 3)
2. **Abre tu navegador** en `http://localhost:5173`
3. **Edita archivos** en VSCode
4. **Los cambios aparecen automáticamente** en el navegador (Hot Module Replacement)

### Tipos de Archivos y Comportamiento

| Tipo de Archivo | Comportamiento |
|----------------|----------------|
| `.tsx`, `.ts`  | HMR - Recarga instantánea sin perder estado |
| `.css`         | HMR - Actualización instantánea de estilos |
| `.html`        | Recarga completa de página |
| `package.json` | Requiere reiniciar servidor |

## 🎨 Formateo Automático

El código se formatea automáticamente al guardar (si Prettier está instalado):

- **Guardar archivo**: `Ctrl+S`
- **Formatear manualmente**: `Shift+Alt+F`

## 🔧 Solución de Problemas

### Los cambios no se reflejan

1. **Verifica que el servidor esté corriendo:**
   ```bash
   npm run dev
   ```

2. **Limpia la caché del navegador:**
   - Presiona `Ctrl+Shift+R` (recarga forzada)
   - O abre DevTools y deshabilita caché

3. **Reinicia el servidor de desarrollo:**
   - Detén el servidor (Ctrl+C en la terminal)
   - Ejecuta nuevamente `npm run dev`

4. **Verifica la URL:**
   - Asegúrate de estar en `http://localhost:5173`

### El puerto 5173 está ocupado

Si el puerto está en uso, Vite elegirá automáticamente el siguiente disponible (5174, 5175, etc.). Revisa el mensaje en la terminal.

### TypeScript muestra errores

Si TypeScript no reconoce los tipos:
1. Presiona `Ctrl+Shift+P`
2. Escribe: `TypeScript: Restart TS Server`
3. Presiona Enter

## 📚 Recursos Adicionales

- [Documentación de Vite](https://vitejs.dev/)
- [Documentación de React](https://react.dev/)
- [Documentación de TypeScript](https://www.typescriptlang.org/)
- [VSCode Debugging Guide](https://code.visualstudio.com/docs/editor/debugging)

## 💡 Tips Útiles

1. **Usa snippets**: Escribe `rafce` para crear un componente React funcional
2. **IntelliSense**: Presiona `Ctrl+Space` para ver sugerencias
3. **Go to Definition**: `F12` sobre cualquier símbolo
4. **Find All References**: `Shift+F12`
5. **Rename Symbol**: `F2`
6. **Multi-cursor editing**: `Alt+Click`

## 🚀 Comandos Rápidos VSCode

| Atajo | Acción |
|-------|--------|
| `Ctrl+Shift+P` | Paleta de comandos |
| `Ctrl+P` | Buscar archivo |
| `Ctrl+Shift+F` | Buscar en archivos |
| `Ctrl+ñ` | Toggle terminal |
| `Ctrl+Shift+D` | Abrir Debug |
| `Ctrl+Shift+B` | Run build task |
| `F5` | Start debugging |
| `Ctrl+Shift+E` | Explorador de archivos |
