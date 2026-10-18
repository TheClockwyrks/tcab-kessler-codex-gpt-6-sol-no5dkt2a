# Kessler

Kessler is a browser arcade game about clearing orbital debris. Circle a planet with a deflector, launch a demolition ball into three rotating rings, and steer each return bounce. Broken targets may shed salvage pods that grant a wider deflector, a shield, piercing shots, or extra balls. The rings refill at higher speed after each wave.

## Run

```bash
npm ci
npm run dev
```

Open the local URL Vite prints. To produce the self-contained static site, run `npm run build` and serve `dist/` with any static server. The same build works under a subpath. The art, effects, and sound are committed under `assets/` and copied into the site through `public/assets`.

## Controls

| Action | Keys |
| --- | --- |
| Orbit counterclockwise | Left Arrow or A |
| Orbit clockwise | Right Arrow or D |
| Launch parked ball | Space |
| Menu selection | Up/Down Arrow or W/S, then Space or Enter |
| Pause or resume | Escape or P |

Menus also work with mouse, pen, and touch. A ball that reaches the planet burns up; losing the final live ball costs a life. Clear every derelict for a wave bonus and a faster field.

## Development checks

`npm run typecheck`, `npm run lint`, `npm run format`, and `npm test` run the project checks. The game uses the supplied Simple 2D engine and the committed, generated assets; building never invokes the generation tools.
