# SCagenda

Aplicacion web ligera, pensada para celular, para organizar la visita del superintendente viajante.

## Desarrollo

1. Copie `.env.example` a `.env` y complete las variables `VITE_FIREBASE_*`.
2. Instale dependencias del cliente con `npm install`.
3. Instale dependencias de Functions con `cd functions && npm install`.
4. Inicie el cliente con `npm run dev`.

## Produccion

- Cree la version final del cliente con `npm run build`.
- Despliegue la funcion `loginWithCongregationCode` desde `functions/`.
- Publique `firestore.rules` en Firebase.

## Modelo de acceso

- La app usa `congregation name + congregationNumber`.
- El cliente no valida el numero directamente.
- Una Cloud Function valida el nombre y numero y devuelve un Firebase custom token.
- Firestore solo permite acceso cuando el token tiene:
  - `role: "congregation"`
  - `congregation_id`

## Colecciones usadas

- `congregations`
- `activities`
- `agendas`

## Campos requeridos en `congregations`

Cada congregacion que vaya a entrar debe tener:

- `name`
- `congregationNumber`
- `loginEnabled`
- `loginAlias` opcional pero recomendado

`loginAlias` debe ser una version simple del nombre para facilitar el acceso.
Ejemplo: `brisas del llano - saravena` -> `brisas del llano - saravena`

## Seleccion de agenda

- La app busca `activities.type == "Congregation Visit"`.
- Filtra por `activities.congregation_id`.
- Muestra la proxima visita.
- Si no hay una futura, muestra la ultima visita pasada.
- Guarda la agenda en `agendas/{activityId}`.

## Estructura

- `index.html`: shell principal.
- `src/main.js`: login, carga y guardado de agenda.
- `src/firebase.js`: cliente Firebase.
- `firestore.rules`: reglas por `congregation_id`.
- `functions/index.js`: validacion del codigo y custom token.

## Importante

- En Firebase Authentication debe estar habilitado Custom Auth en el proyecto que emite el token.
- La funcion y el cliente deben usar el mismo proyecto Firebase.
- Si cambia el `congregationNumber` de una congregacion, el acceso anterior deja de servir.
