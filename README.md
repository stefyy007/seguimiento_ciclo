# Mi Ciclo — PWA privada

Aplicación web instalable para seguimiento menstrual. Los registros se cifran y almacenan localmente en el dispositivo. No usa Google, servidores propios, analítica ni publicidad.

## Funciones
- PIN de 6 dígitos y clave de recuperación.
- Registro por fecha de menstruación, flujo, cólicos, productos, actividad sexual, anticonceptivos y notas.
- Rueda del ciclo con menstruación real, fase folicular, ventana fértil/ovulatoria estimada, fase lútea y puntos de actividad sexual.
- Calendario anual con indicadores de menstruación, actividad sexual y notas.
- Configuración editable de duración promedio del ciclo, menstruación y fase lútea.
- Exportación de registros a CSV (sin cifrar).
- Respaldo/restauración cifrada en JSON.
- Funciona offline después de la primera carga.

## Privacidad
Los datos clínicos/personales se guardan como un blob cifrado AES-GCM en IndexedDB. La clave maestra se protege con un PIN derivado mediante PBKDF2 (250.000 iteraciones) y también con una clave de recuperación aleatoria. El PIN no se guarda en texto plano.

El CSV es legible y no está cifrado. Trátalo como información privada.

## Estimaciones
La app calcula el promedio del ciclo usando intervalos observados entre inicios de menstruación cuando hay suficientes registros. Si todavía no hay historial, usa los valores configurados (28 días de ciclo, 5 días de menstruación y 14 días de fase lútea por defecto).

La ventana fértil y la ovulación son estimaciones y no deben usarse como método anticonceptivo ni para descartar embarazo.

## Publicar en GitHub Pages
1. Crea un repositorio nuevo, por ejemplo `mi-ciclo`.
2. Sube el contenido de esta carpeta directamente a la raíz del repositorio.
3. En Settings → Pages selecciona `Deploy from a branch`, `main`, `/ (root)`.
4. Abre la URL publicada desde Safari.
5. Configura el PIN y guarda la clave de recuperación.
6. En Safari usa Compartir → Agregar a Inicio para instalarla.

## Respaldo
Antes de borrar datos de Safari, eliminar la app o cambiar de dispositivo, descarga un respaldo cifrado desde Configuración. Para restaurarlo en otro dispositivo, importa el JSON y desbloquea con el PIN original o la clave de recuperación.
