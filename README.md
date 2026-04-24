# SCagenda

Lightweight web application, designed for mobile, to organize the circuit overseer's visit.

## Development

1. Copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` variables.
2. Install client dependencies with `npm install`.
3. Install Functions dependencies with `cd functions && npm install`.
4. Start the client with `npm run dev`.

## Production

- Create the final version of the client with `npm run build`.
- Deploy the `loginWithCongregationCode` function from `functions/`.
- Publish `firestore.rules` to Firebase.

## Access Model

- The app uses `congregation name + congregationNumber`.
- The client does not validate the number directly.
- A Cloud Function validates the name and number and returns a Firebase custom token.
- Firestore only allows access when the token has:
  - `role: "congregation"`
  - `congregation_id`

## Collections Used

- `congregations`
- `activities`
- `agendas`

## Required Fields in `congregations`

Each congregation intended to access must have:

- `name`
- `congregationNumber`
- `loginEnabled`
- `loginAlias` (optional but recommended)

`loginAlias` should be a simplified version of the name to facilitate access.
Example: `Brisas del Llano - Saravena` -> `brisas del llano - saravena`

## Agenda Selection

- The app searches for `activities.type == "Congregation Visit"`.
- Filters by `activities.congregation_id`.
- Displays the upcoming visit.
- If there is no future visit, it displays the most recent past visit.
- Saves the agenda in `agendas/{activityId}`.

## Structure

- `index.html`: Main shell.
- `src/main.js`: Login, loading, and saving of the agenda.
- `src/firebase.js`: Firebase client.
- `firestore.rules`: Rules based on `congregation_id`.
- `functions/index.js`: Code validation and custom token generation.

## Important

- Custom Auth must be enabled in the Firebase project that issues the token.
- Both the function and the client must use the same Firebase project.
- If a congregation's `congregationNumber` changes, the previous access will stop working.
