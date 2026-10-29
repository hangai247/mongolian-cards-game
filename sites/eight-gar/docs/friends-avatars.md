# Friends avatar library

Eleven portraits created with the built-in Image Generation tool from user-provided reference photographs. Names were supplied by the user in photo order. Existing seven portraits are retained; the catalog now has eighteen choices.

Game assets are transparent 720 × 960 WebP files in `sites/eight-gar/dist/assets/characters/`, exported with cwebp quality 88. Full-resolution PNG copies are in `output/avatars/` (local, ignored by Git). The database allowlist is extended by migrations `003_friends_avatars.sql` and `004_amraa_anu_avatars.sql` on the next server startup.

## Photo mapping

| Photo | Name | Asset |
| --- | --- | --- |
| 1 | Сонио | sonio.webp |
| 2 | Тэгшээ | tegshee.webp |
| 3 | Булгаа | bulgaa.webp |
| 4 | Нямаа | nyamaa.webp |
| 5 | Уугий | uugii.webp |
| 6 | Энгүүж | enguuj.webp |
| 7 | Хүслээ | khuslee.webp |
| 8 | Гэрлээ | gerlee.webp |
| 9 | Доожий | doojii.webp |
| Second batch, 1 | Амраа | amraa.webp |
| Second batch, 2 | Ану | anu-friend.webp |

The photo-based Ану uses a distinct ID so the original `anu` preset and saved choices remain intact. Both retain the name Ану.

## Verification

Second batch (Амраа and Ану): engine/server builds and five focused avatar tests pass. Both exports have alpha transparency and dimensions of 720 × 960. The eighteen catalog IDs match the latest database migration's allowlist exactly. The existing PostgreSQL-server limitation below still applies.

First batch: all nine WebP exports have alpha transparency and dimensions of 720 × 960. The expanded sixteen-choice picker was inspected in the browser, including selecting Сонио and checking his preview. Engine and server builds pass. Across the engine, browser and server suites, 251 tests pass after rerunning the four loopback-dependent tests with local network access. The PostgreSQL test remains unverified because this machine has libpq clients but no PostgreSQL server executable. No production deployment was performed.

## Exact generation prompts

### Амраа (amraa)

Use case: stylized-concept. Create ONE photorealistic cinematic game avatar cutout of Амраа, the adult woman wearing red in reference image 1. Preserve her recognizable face, neatly pulled-back black hair, facial proportions, cheek shape and broad warm toothy smile. Image 2 is STYLE AND FRAMING ONLY, do not copy its identity or braided hair. Match existing game library: natural skin texture, photographic realism, rich vermilion red silk traditional deel with restrained antique gold trim, warm amber upper-left light and subtle cool rim light. Genuinely transparent background, portrait 3:4. Seated at eye-level, almost frontal with a slight turn toward viewer's right, top of hair 5% from top to hips at bottom. Both full arms elbows wrists and hands included without side cropping, relaxed natural seated anatomy. Empty hands at lower middle near 75% height slightly apart with naturally loose curled fingers as if ready for cards. Keep her own pulled-back hairstyle and friendly smile. No other people, child, cards, props, table, chair, ground shadow, scenery, text or watermark. One single cutout.

### Ану (anu-friend)

Use case: stylized-concept. Create ONE photorealistic cinematic game avatar cutout of Ану, the adult woman centered in reference image 1 wearing yellow with denim straps. Preserve her recognizable softly rounded face, straight shoulder-length black hair with center part, small stud earrings, facial proportions and gentle closed-mouth smile. Image 2 is STYLE AND FRAMING ONLY, do not copy its identity or braided hair. Match existing game library: natural skin texture, photographic realism, muted golden ochre silk traditional deel with narrow antique gold trim, warm amber upper-left light and subtle cool rim light. Genuinely transparent background, portrait 3:4. Seated at eye-level, almost frontal with a slight turn toward viewer's left, top of hair 5% from top to hips at bottom. Both full arms elbows wrists and hands included without side cropping, relaxed natural seated anatomy. Empty hands at lower middle near 75% height slightly apart with naturally loose curled fingers as if ready for cards. Keep her own shoulder-length hairstyle and soft smile. No other people, man at right, denim straps, cards, props, table, chair, ground shadow, scenery, text or watermark. One single cutout.


### Сонио (sonio)

Use case: stylized-concept. Create ONE photorealistic cinematic game avatar cutout of Сонио, the man in reference image 1. Preserve his recognizable face, short side swept black hair, round black glasses, moustache and subtle chin stubble, natural facial proportions and friendly composed expression. Reference image 2 is STYLE AND FRAMING ONLY, do not copy that person's identity. Match the existing library: seated adult, photographic realism, natural skin and hair, deep midnight blue traditional deel with restrained antique gold trim, warm upper-left amber light and subtle cool rim light. Portrait 3:4 canvas, genuinely transparent background. Seated eye-level camera, top of hair 5% below top, framed to hips, both complete arms elbows wrists and hands within canvas. Torso almost frontal, slightly turned toward viewer's right. Empty hands at lower middle about 75% canvas height, held slightly apart with naturally loosely curled fingers as if ready to hold cards. No cards, props, table, chair, other people, background, ground shadow, text or watermark. Keep glasses and facial likeness especially faithful. Single person, single final cutout.

### Тэгшээ (tegshee)

Use case: stylized-concept. Create ONE photorealistic cinematic game avatar cutout of Тэгшээ, the man in reference image 1 standing next to a trophy. Preserve his recognizable face, short side swept black hair, facial proportions, dark eyebrows and friendly small smile. Reference image 2 is STYLE AND FRAMING ONLY, do not copy that person's identity. Match the existing library: seated adult, photographic realism, natural skin and hair, muted plum charcoal traditional deel with restrained antique gold trim, warm upper-left amber light and subtle cool rim light. Portrait 3:4 canvas, genuinely transparent background. Seated eye-level camera, top of hair 5% below top, framed to hips, both complete arms elbows wrists and hands within canvas. Torso almost frontal, slightly turned toward viewer's right. Empty hands at lower middle about 75% canvas height, held slightly apart with naturally loosely curled fingers as if ready to hold cards. No cards, props, trophy, backpack, sports logos, table, chair, other people, background, ground shadow, text or watermark. Keep facial likeness especially faithful. Single person, single final cutout.

### Булгаа (bulgaa)

Use case: stylized-concept. Create ONE photorealistic cinematic game avatar cutout of Булгаа, the woman centered in reference image 1. Identity reference is image 1: preserve her recognizable rounded face, long loose dark hair, facial proportions and warm smile. Image 2 is STYLE AND FRAMING ONLY, do not copy its identity or braided hair. Match existing game library: natural skin texture, photographic realism, dark burgundy silk traditional deel with restrained gold embroidery, warm amber upper-left light and subtle cool rim light. Genuinely transparent background, portrait 3:4. Seated at eye-level, almost frontal with a slight turn toward viewer's right, top of hair 5% from top to hips at bottom. Both full arms elbows wrists and hands included without side cropping, relaxed natural seated anatomy. Empty hands at lower middle near 75% height slightly apart with naturally loose curled fingers as if ready for cards. Keep her own loose hair and friendly expression. No other people, cards, props, table, chair, ground shadow, scenery, text or watermark. One single cutout.

### Нямаа (nyamaa)

Use case: stylized-concept. Create ONE photorealistic cinematic game avatar cutout of Нямаа, the man in reference image 1. Preserve his recognizable face, short neat black hair, narrow moustache, facial proportions and composed slight smile. Image 2 is STYLE AND FRAMING ONLY, do not copy its identity. Match existing game library: natural skin texture, photographic realism, warm olive brown traditional deel with restrained gold trim, warm amber upper-left light and subtle cool rim light. Genuinely transparent background, portrait 3:4. Seated at eye-level, almost frontal with a slight turn toward viewer's left, top of hair 5% from top to hips at bottom. Both full arms elbows wrists and hands included without side cropping, relaxed natural seated anatomy. Empty hands at lower middle near 75% height slightly apart with naturally loose curled fingers as if ready for cards. No other people, cards, props, table, chair, ground shadow, scenery, text or watermark. One single cutout.

### Уугий (uugii)

Use case: stylized-concept. Create ONE photorealistic cinematic game avatar cutout of Уугий, the man in reference image 1. Preserve his recognizable full rounded face, thick short black hair, thin rectangular metal glasses, clean shaven look, facial proportions and gentle smile. Image 2 is STYLE AND FRAMING ONLY, do not copy its identity. Match existing game library: natural skin texture, photographic realism, deep charcoal teal traditional deel with restrained antique gold trim, warm amber upper-left light and subtle cool rim light. Genuinely transparent background, portrait 3:4. Seated at eye-level, almost frontal with a slight turn toward viewer's right, top of hair 5% from top to hips at bottom. Both full arms elbows wrists and hands included without side cropping, relaxed natural seated anatomy. Empty hands at lower middle near 75% height slightly apart with naturally loose curled fingers as if ready for cards. Preserve his facial fullness and glasses accurately. No other people, cards, props, table, chair, ground shadow, scenery, text or watermark. One single cutout.

### Энгүүж (enguuj)

Use case: stylized-concept. Create ONE photorealistic cinematic game avatar cutout of Энгүүж, the woman centered in reference image 1. Identity reference is image 1: preserve her recognizable face, very long straight black hair draped over a shoulder, small earrings, facial proportions and gentle smile. Image 2 is STYLE AND FRAMING ONLY, do not copy its identity or braided hair. Match existing game library: natural skin texture, photographic realism, forest jade silk traditional deel with narrow muted gold trim, warm amber upper-left light and subtle cool rim light. Genuinely transparent background, portrait 3:4. Seated at eye-level, almost frontal, top of hair 5% from top to hips at bottom. Both full arms elbows wrists and hands included without side cropping, relaxed natural seated anatomy. Empty hands at lower middle near 75% height slightly apart with naturally loose curled fingers as if ready for cards. Keep her own straight hair and friendly expression. No other people or other person's hand on shoulder, cards, props, table, chair, ground shadow, scenery, text or watermark. One single cutout.

### Хүслээ (khuslee)

Use case: stylized-concept. Create ONE photorealistic cinematic game avatar cutout of Хүслээ, the man centered in reference image 1 wearing dark blue. Preserve his recognizable broad face, closely cropped black hair, clean shaven look, facial proportions and relaxed slight smile. Image 2 is STYLE AND FRAMING ONLY, do not copy its identity. Match existing game library: natural skin texture, photographic realism, dark slate blue traditional deel with restrained antique gold trim, warm amber upper-left light and subtle cool rim light. Genuinely transparent background, portrait 3:4. Seated at eye-level, almost frontal with a slight turn toward viewer's left, top of hair 5% from top to hips at bottom. Both full arms elbows wrists and hands included without side cropping, relaxed natural seated anatomy. Empty hands at lower middle near 75% height slightly apart with naturally loose curled fingers as if ready for cards. No other people, cards, props, table, chair, ground shadow, scenery, text or watermark. One single cutout.

### Гэрлээ (gerlee)

Use case: stylized-concept. Create ONE photorealistic cinematic game avatar cutout of Гэрлээ, the woman in reference image 1. Preserve her recognizable rounded face, center-parted dark hair tied back with loose wisps, facial proportions and broad warm toothy smile. Image 2 is STYLE AND FRAMING ONLY, do not copy its identity or braid. Match existing game library: natural skin texture, photographic realism, muted deep blue silk traditional deel with subtle gold embroidered collar, warm amber upper-left light and subtle cool rim light. Genuinely transparent background, portrait 3:4. Seated at eye-level, almost frontal with a slight turn toward viewer's left, top of hair 5% from top to hips at bottom. Both full arms elbows wrists and hands included without side cropping, relaxed natural seated anatomy. Empty hands at lower middle near 75% height slightly apart with naturally loose curled fingers as if ready for cards. Keep her own hairstyle and bright smile. No other people, cards, props, table, chair, ground shadow, scenery, text or watermark. One single cutout.

### Доожий (doojii)

Use case: stylized-concept. Create ONE photorealistic cinematic game avatar cutout of Доожий, the woman in reference image 1. Preserve her recognizable oval face, long straight side-parted dark brown hair, facial proportions, subtle earrings and composed slight smile with naturally rosy lips. Image 2 is STYLE AND FRAMING ONLY, do not copy its identity or braid. Match existing game library: natural skin texture, photographic realism, deep aubergine silk traditional deel with narrow antique gold trim, warm amber upper-left light and subtle cool rim light. Genuinely transparent background, portrait 3:4. Seated at eye-level, almost frontal with a slight turn toward viewer's left, top of hair 5% from top to hips at bottom. Both full arms elbows wrists and hands included without side cropping, relaxed natural seated anatomy. Empty hands at lower middle near 75% height slightly apart with naturally loose curled fingers as if ready for cards. Keep her own hairstyle, face and expression faithful. No other people, cards, props, table, chair, ground shadow, scenery, text or watermark. One single cutout.

