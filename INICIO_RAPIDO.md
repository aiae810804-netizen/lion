# 🚀 Inicio Rápido - VSCode

## ¿Cómo ver los cambios reflejados en VSCode?

### ✅ Solución Rápida (3 pasos)

1. **Abre el proyecto en VSCode**
   ```bash
   code .
   ```

2. **Instala las extensiones recomendadas**
   - VSCode te lo pedirá automáticamente
   - O presiona `Ctrl+Shift+P` → `Extensions: Show Recommended Extensions`

3. **Inicia el servidor de desarrollo**
   - Presiona `Ctrl+Shift+B` (atajo más rápido)
   - O presiona `Ctrl+Shift+P` → `Tasks: Run Task` → `Dev: Ejecutar servidor de desarrollo`

**¡Listo!** Ahora edita cualquier archivo y verás los cambios instantáneamente en `http://localhost:5173`

---

## 📝 ¿Qué incluye esta configuración?

### Archivos VSCode (.vscode/)
- ✅ **settings.json** - Formateo automático al guardar
- ✅ **tasks.json** - Comandos rápidos (Ctrl+Shift+B)
- ✅ **launch.json** - Debugging con F5
- ✅ **extensions.json** - Extensiones recomendadas

### Funcionalidades
- ✅ **Hot Module Replacement (HMR)** - Cambios instantáneos sin recargar página
- ✅ **Auto-formateo** - Código formateado al guardar (Ctrl+S)
- ✅ **IntelliSense** - Autocompletado para TypeScript, React y Tailwind
- ✅ **Debugging** - Debug en Chrome con breakpoints
- ✅ **Atajos de teclado** - Tareas con un solo comando

---

## ⌨️ Atajos Principales

| Atajo | Acción |
|-------|--------|
| `Ctrl+Shift+B` | ▶️ Iniciar servidor de desarrollo |
| `F5` | 🐛 Iniciar debugging |
| `Ctrl+S` | 💾 Guardar y formatear |
| `Ctrl+Shift+P` | 🎯 Paleta de comandos |

---

## 🎯 Tipos de Cambios

| Archivo editado | Resultado |
|----------------|-----------|
| `.tsx` `.ts` | ⚡ Actualización instantánea (HMR) |
| `.css` | ⚡ Actualización de estilos sin recargar |
| `.html` | 🔄 Recarga completa de página |

---

## 📚 Más Información

- **Guía completa**: Ver [DESARROLLO.md](DESARROLLO.md)
- **README actualizado**: Ver [README.md](README.md)

---

## ❓ Problemas Comunes

**Los cambios no se ven:**
1. Verifica que el servidor esté corriendo (Ctrl+Shift+B)
2. Recarga el navegador (Ctrl+Shift+R)
3. Revisa que estés en `http://localhost:5173`

**Puerto ocupado:**
- Vite elegirá el siguiente puerto disponible (5174, 5175...)
- Revisa el mensaje en la terminal

**TypeScript con errores:**
- Presiona `Ctrl+Shift+P` → `TypeScript: Restart TS Server`
