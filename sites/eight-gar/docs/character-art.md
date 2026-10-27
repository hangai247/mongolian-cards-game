# Realistic character artwork

Generated with the built-in image generation tool, one transparent asset per character. All seven WebP assets are bundled in `dist/assets/characters/`. They are photographic 2.5D cutouts animated on deformable meshes, not volumetric human models. Their hands contain no baked-in cards. Export used cwebp at width 720, quality 88, retaining alpha. Original generated PNGs remain in the user's generated-image folder.

## Shared prompt

Create ONE photorealistic cinematic game character cutout on a genuinely transparent background. Portrait 3:4 canvas. One seated adult Mongolian person, realistic human proportions, life-size photographic face (NOT doll, toy, cartoon, statue, chibi, or plastic). Natural skin pores, fine hair strands, soft warm amber light from upper left and subtle cool window rim light. Camera at seated eye level, 50mm lens look. Framed from top of hair (5% from top) to hips at bottom; BOTH complete arms, elbows, wrists and hands included, no cropping sides. Person occupies almost full canvas width. Anatomically natural seated posture, shoulders relaxed, elbows lowered/resting at imagined table height. Both hands at lower middle around 72% canvas height, held 12cm apart as if holding a small fan of cards; fingers naturally loosely curled, thumbs visible. Hands are EMPTY: NO cards, NO props, NO table, NO chair, NO background, NO text, NO labels. We will add live cards in front of hands with code. Bottom of coat ends at image bottom, no ground shadow. Detailed naturally folded clothing, understated lived-in realism. Reference aesthetic: realistic friends playing cards in a warm Mongolian lodge. 

## Character-specific prompt suffixes

### temu.webp

Temu: Mongolian man age 32, lean angular face, natural slightly tousled short black hair, very light stubble, deep midnight blue silk deel with subtle antique gold trim. Left side seat: torso three-quarter toward the viewer's right, eyes toward table center, relaxed elbows.

### bataa.webp

Bataa: Mongolian man age 42, slightly broader strong adult face, short side swept black hair, clean shaven, muted plum charcoal woven deel with antique gold trim. Torso turned 12 degrees toward viewer's right, slight thoughtful head tilt.

### sarnai.webp

Sarnai: Mongolian woman age 28, long dark loosely braided hair, subtle small gold earrings, dark burgundy silk deel with finely woven restrained gold embroidery. Torso slightly turned toward viewer's right, poised friendly attentive gaze down toward cards.

### anu.webp

Anu: Mongolian woman age 34, dark hair swept back in a loose bun with natural stray strands, small gold earrings, forest jade silk deel with narrow muted gold trim. Center seat, facing camera, slight lean forward, gentle confident smile, gaze below lens.

### bold.webp

Bold: Mongolian man age 49, textured face with fine lines, short cropped hair, sparse moustache, dark warm olive brown woven deel with restrained gold trim. Torso turned 12 degrees toward viewer's left, relaxed thoughtful expression.

### naraa.webp

Naraa: Mongolian woman age 36, long dark hair draped behind shoulders, natural oval face, small gold earrings, muted deep blue deel with subtle gold embroidered collar. Torso turned 18 degrees toward viewer's left, warm alert expression, relaxed shoulders.

### oyu.webp

Oyu: Mongolian woman age 26, long dark hair loosely tied back with wisps framing face, green teal silk deel with antique gold edging. Right side seat: torso three-quarter toward viewer's left, comfortable slight lean, understated smile, looking toward table center.

## Verification

Game presentation and strategy tests pass. The live artwork renderer receives only public phase, turn, winner and hand counts. Static portraits remain available if WebGL fails. Pause, reduced motion and hidden tabs stop idle animation. The game rules and card-flight implementation are unchanged.

