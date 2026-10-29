# Naiman / Modern — 43-card playing deck

A complete replacement of the earlier ornamental card design, implemented in the actual online and practice renderer. The game still has exactly 40 suited cards and three jokers. No game rules or hand motion behavior changes.

## Design decisions

- Clear identification comes first: bold sans-serif ranks, two mirrored corner indices, vector suit silhouettes, and protected corner rails.
- Warm white stock (`#FAF8F2`), midnight ink (`#16343D`), vermilion (`#BD3E37`), with mint and ochre reserved for illustration and the reverse.
- Card-relative sizing preserves legibility through the existing hand, table, inspection and flight layouts. The face radius is 7.5% horizontal / 4.9% vertical.
- Number cards use explicit pip coordinates and preserve exact counts. The two and three receive larger pips; lower-half pips are inverted.
- Aces use a large suit silhouette with two diagonal cuts, followed by the small Naiman Gar signature.
- Newly generated queen, king and jack art uses open silhouettes, broad flat color, traditional Mongolian clothing and two-way composition. The frame-free artwork has corner cutouts and secondary suit markers.
- Newly generated gray/moon, black/star and red/sun jokers use distinct illustration, written Mongolian color names, and Roman corner indices: red I, black II, gray III. Color is never the only identity cue.
- The reverse is a new rotationally symmetric mint and midnight geometric pattern. All opponent, reserve and flying backs use the same asset without reading hidden identity.
- Selection keeps the existing green check and adds an outer ring without changing the face dimensions. Keyboard focus and the existing reduced-motion behavior remain intact.

## Files

- `sites/eight-gar/dist/card-system.js`: shared face markup, exact pip positions, accessible labels and identity handling.
- `sites/eight-gar/dist/card-system.css`: complete card visual system.
- `sites/eight-gar/dist/assets/naiman-courts-v2.png`: new court atlas, queen / king / jack in equal thirds.
- `sites/eight-gar/dist/assets/naiman-jokers-v2.png`: new joker atlas, gray / black / red in equal thirds.
- `sites/eight-gar/dist/assets/naiman-card-back-v2.svg`: new vector reverse.
- `sites/eight-gar/tests/deck-design-preview.html`: review sheet rendered from the real 43-card deck and shared renderer; not a separate product collection.

## Artwork production

Both PNG atlases were generated with the built-in ImageGen tool and copied into the project. Typography, pips, suit identity, accessible labels and card boundaries are rendered by the application, not baked into generated images. The reverse and suit silhouettes are native SVG graphics.

### Court prompt

Create a production illustration atlas for a beautifully designed modern Mongolian playing-card game. ONE image, landscape aspect ratio 3:2, exactly THREE equally wide vertical panels side by side with NO gaps or panel borders. Each panel has aspect ratio 1:2 and identical plain warm offwhite background #FAF8F2. Left panel: Mongolian QUEEN in traditional tall boqta headdress. Middle panel: Mongolian KING with traditional crown, strong mustache, holding ceremonial sword. Right panel: young Mongolian JACK, an archer wearing traditional hat, holding a bow. Every panel contains a TWO-HEADED rotationally symmetrical playing card court: upper half upright bust from head to waist, lower half exact corresponding upside-down bust, joined by a clean geometric diagonal band across the center. ALL figures must have equal scale and share one illustration language. Premium contemporary graphic illustration with bold geometric silhouettes, elegant clear faces, clean flat vector-like shapes and limited spot inks: deep midnight #16343D, vermilion #C4453C, muted mint #9FBEB2, ochre #D7AB60, warm white. Stylized editorial design with generous negative space around heads, crisp wide linework, broad color fields, traditional Mongolian clothing simplified into strong geometric patterns. Absolutely NO dense engraving, NO photo realism, NO gradients, NO gold ornate frames, NO background scenery, NO lettering, NO numbers, NO suit symbols, NO card borders. Flat orthographic asset, no perspective, no mockup, no shadow. The three panels must meet exactly at one-third and two-thirds of canvas so they can be displayed with CSS background-position. Artwork must stay inside each own panel with 7% blank margin horizontally. Output high quality.

### Joker prompt

A production illustration atlas for three JOKER playing cards in a contemporary premium Mongolian card game. Landscape 3:2 canvas, exactly THREE equally wide vertical panels edge to edge. Every panel aspect 1:2, same plain offwhite background #FAF8F2. No gaps or borders. Three bold graphic TWO-WAY symmetrical fantasy court jesters inspired by Mongolian traditional costume, with expressive human faces, dynamic pointed headdresses and ribbons. Each figure is double-headed, upright bust on top and upside-down matching bust on bottom, joined at waist across exact vertical midpoint of image. Left: SILVER MOON JOKER, predominantly cool slate gray, mint, ivory, with a large crescent moon motif. Center: MIDNIGHT STAR JOKER, predominantly deep navy blue #16343D and mint with ochre accents and a large star motif. Right: VERMILION SUN JOKER, predominantly red #C4453C with navy and ochre accents and a sun motif. Contemporary editorial flat vector-like illustration, crisp geometric shapes, simplified broad silhouettes, a few decorative geometric clothing details. Playful but sophisticated, not sinister or clown makeup, no grinning teeth. Large clear recognizable figures suitable for tiny mobile playing cards. Generous offwhite negative space, each figure fully contained within own one-third panel, 10% horizontal margin. No lettering, no numbers, no text, no card frames, no border, no photo realism, no shading gradients, no busy backgrounds, no ornate engraving. Equal scale and same graphic language across all three. The subjects should fill 90% of each panel height, central half-width at head and broader at waist. Exact equal thirds for CSS atlas use.

## Verification

`npm test -w sites/eight-gar`: 88 passing client tests, including all 43 identities, exact pip counts and opaque opponent backs. `tests/card-style-qa.html` exercises actual practice hands, table piles, card visibility, selection and sorting at 1440×900, 390×844, 320×568 and 844×390. Existing game actions and motion controllers are preserved.
