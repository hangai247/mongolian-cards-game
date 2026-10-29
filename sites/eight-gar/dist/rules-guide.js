// Static teaching examples; never read or change the current match.
const suits = { '♠': 'Гил', '♣': 'Цэцэг', '♦': 'Дөрвөлжин', '♥': 'Бундан' };
function card(rank, suit) {
  return `<span class="guide-card${suit === '♥' || suit === '♦' ? ' guide-red' : ''}" role="img" aria-label="${suits[suit]} ${rank}"><b aria-hidden="true">${rank}</b><span aria-hidden="true">${suit}</span></span>`;
}
const cards = values => `<div class="guide-cards">${values.map(([rank, suit]) => card(rank, suit)).join('')}</div>`;
const arrow = '<span class="guide-arrow" aria-hidden="true">→</span>';
const lead = [['7', '♠'], ['7', '♣'], ['9', '♦']];
const defense = [['8', '♠'], ['9', '♣'], ['10', '♦']];
const lessons = [
  {
    name: 'Товч танилцуулга', title: 'Хамтдаа тоглож, багаараа хожоорой',
    body: `<div class="guide-facts"><div><b>8</b><span>тоглогч</span></div><div><b>2</b><span>баг</span></div><div><b>5</b><span>хөзөр хүн бүрт</span></div><div><b>3</b><span>хөзөр газарт</span></div></div>
      <p>Хоёр багийн тоглогчид ээлжилж сууна. Хөзрөө тараасны дараа эхлэх баг ярилцаж, эхлэгчээ сонгоно.</p>
      <ol class="guide-summary"><li>Хоосон ширээнд эхэлж тавина.</li><li>Дараагийн хүн хамгийн сүүлд тавьсан хөзрийг дарна, эсвэл ширээн дээрх бүх хөзрийг авна.</li><li>Тавьсны дараа газарт хөзөр байвал гарын хөзрийг тав хүртэл автоматаар нөхнө.</li></ol>
      <p class="guide-note"><strong>Зорилго:</strong> нөхөлт дууссаны дараа хөзөргүй болсон тоглогчийн баг үеийг хожно. Түрүүлж <strong>5 үе</strong> хожсон баг ялна.</p>`,
  },
  {
    name: 'Эхэлж тавих', title: 'Хоосон ширээнд эхэлж тавина',
    body: `<div class="guide-examples"><figure><figcaption>Нэг хөзөр</figcaption>${cards([['7', '♠']])}<p>Дурын нэг хөзөр, эсвэл нэг жокер тавьж болно.</p></figure>
      <figure><figcaption>Гурван хөзөр</figcaption>${cards(lead)}<p>Хос 7 + дурын энгийн 9. <strong>Бүх тоглогч дор хаяж 3 хөзөртэй</strong> үед зөвшөөрнө.</p></figure></div>
      <p>Ижил чансаатай гурван хөзөр мөн хос агуулдаг. Жокерийг олон хөзрийн багцад оруулахгүй.</p>
      <p class="guide-note"><strong>Таван хөзрийн онцгой нөхцөл:</strong> хоёр хос + нэг энгийн хөзөр; газар дууссан, бүх тоглогч дор хаяж 5 хөзөртэй байх ёстой. <button type="button" class="guide-link" data-guide-five>Бүрэн нөхцөлийг харах →</button></p>`,
  },
  {
    name: 'Дарах', title: 'Хөзөр бүрийг нэг нэгээр нь дарна',
    body: `<p>Хамгийн сүүлд тавьсантай <strong>ижил тооны</strong> хөзөр тавина. Ижил тамганы илүү чансаатай хөзөр дарна.</p>
      <figure><figcaption>Ширээний хөзөр → таны дарах хөзөр</figcaption><div class="guide-pairs">${lead.map(([rank, suit], i) => `<div>${card(rank, suit)}${arrow}${card(...defense[i])}</div>`).join('')}</div><p>Гилийн 8 нь 7-г, цэцгийн 9 нь 7-г, дөрвөлжингийн 10 нь 9-г дарна. Дарах багцад хос хэрэггүй; хөзөр бүр нэг өөр хөзрийг дарна.</p></figure>
      <figure class="guide-trump"><figcaption>Энэ жишээнд хөзөр: ♥ Бундан</figcaption><div class="guide-flow">${card('A', '♠')}${arrow}${card('7', '♥')}<p>Бундангийн 7 нь гилийн A-г дарна: хөзөр нь өөр тамганы энгийн хөзрийг дардаг.</p></div></figure>
      <p class="guide-note">Чансаа, жокер болон олон хөзрөөр дарах дэлгэрэнгүй дүрмийг «Бүрэн дүрэм»-ээс үзээрэй.</p>`,
  },
  {
    name: 'Авах', title: 'Авахдаа ширээний бүх хөзрийг авна',
    body: `<figure><figcaption>Эхний хүн 7♠ тавьж, дараагийн хүн 8♠-аар даржээ</figcaption><div class="guide-flow">${card('7', '♠')}${arrow}${card('8', '♠')}</div></figure>
      <figure class="guide-pickup"><figcaption>Одоо таны ээлж: хоёуланг нь гартаа авна</figcaption><div class="guide-flow">${cards([['7', '♠'], ['8', '♠']])}${arrow}<div class="guide-hand">Таны гар<br><strong>+2 хөзөр</strong></div></div></figure>
      <p>Зөвхөн сүүлийн хөзрийг биш, өмнөх нүүдлүүдийн хөзрийг ч авна. Дарж чадах байсан ч авахыг сонгож болно.</p>
      <p class="guide-note"><strong>Газраас нөхөхгүй.</strong> Ширээ хоосорч, дараагийн тоглогч шинээр эхэлнэ. Унтах мөчлөг тасарна.</p>`,
  },
  {
    name: 'Унтана', title: 'Нэг эхлэл + долоон даралт = Унтана',
    body: `<p>Дундаа хэн ч авахгүйгээр <strong>8 удаа дараалан тавибал</strong> ширээн дээрх бүх хөзөр унтана.</p>
      <figure><figcaption>Нүүдлийг тоолно — хөзрийн тоог биш</figcaption><div class="guide-chain">${['7', '8', '9', '10', 'J', 'Q', 'K', '3'].map((rank, i) => `<div><span>${i + 1} · ${i === 0 ? 'Эхлэл' : 'Даралт'}</span>${card(rank, '♠')}</div>`).join('')}</div></figure>
      <div class="guide-sleep-result"><span aria-hidden="true">↓</span><strong>Нөхөлт → Унтана → Хожлыг шалгана</strong><p>Бүх хөзөр ширээнээс гарч, дараагийн үе хүртэл тоглоомд оролцохгүй. Унтсан хөзрийг авах, эргэж харах боломжгүй.</p></div>
      <p class="guide-note">Нөхөлтийн дараа <strong>найм дахь нүүдлийг хийсэн хүн</strong> хөзөртэй бол өөрөө шинээр эхэлнэ. Хөзөргүй бол түүний баг хожно. Хэн нэгэн авбал энэ мөчлөг тасарна.</p>`,
  },
];

export function mountRulesGuide(dialog, returnFocus) {
  if (!dialog || dialog.querySelector('.rules-guide')) return;
  const top = dialog.querySelector('.dialog-top');
  const full = document.createElement('section');
  full.className = 'guide-full';
  full.hidden = true;
  for (const child of [...dialog.children]) if (child !== top) full.append(child);
  const fullHeading = full.querySelector('h2');
  fullHeading.id = 'guide-full-title';
  fullHeading.tabIndex = -1;
  const fiveHeading = full.querySelector('.rules-grid section:nth-child(2) h3');
  fiveHeading.tabIndex = -1;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'guide-link guide-toggle';
  top.insertBefore(toggle, top.querySelector('button'));
  const guide = document.createElement('section');
  guide.className = 'rules-guide';
  guide.innerHTML = '<div class="guide-scroll"><p class="guide-progress" aria-live="polite" aria-atomic="true"></p><h2 id="guide-title" tabindex="-1"></h2><div class="guide-body"></div></div><nav class="guide-nav" aria-label="Дүрмийн хичээл"><button type="button" class="quiet-button" data-guide-back>← Өмнөх</button><button type="button" class="button primary" data-guide-next></button></nav>';
  dialog.append(guide, full);
  const title = guide.querySelector('h2');
  const body = guide.querySelector('.guide-body');
  const back = guide.querySelector('[data-guide-back]');
  const next = guide.querySelector('[data-guide-next]');
  let step = 0;
  function showGuide(focus = true) {
    full.hidden = true;
    guide.hidden = false;
    toggle.textContent = 'Бүрэн дүрэм';
    dialog.setAttribute('aria-labelledby', title.id);
    const lesson = lessons[step];
    guide.querySelector('.guide-progress').textContent = `${step + 1} / ${lessons.length} · ${lesson.name}`;
    title.textContent = lesson.title;
    body.innerHTML = lesson.body;
    back.disabled = step === 0;
    next.textContent = step === lessons.length - 1 ? 'Ширээнд буцах' : 'Дараах →';
    dialog.scrollTop = 0;
    guide.querySelector('.guide-scroll').scrollTop = 0;
    full.scrollTop = 0;
    if (focus) title.focus({ preventScroll: true });
  }
  function showFull(five = false) {
    guide.hidden = true;
    full.hidden = false;
    toggle.textContent = '← Хичээлд буцах';
    dialog.setAttribute('aria-labelledby', fullHeading.id);
    dialog.scrollTop = 0;
    guide.querySelector('.guide-scroll').scrollTop = 0;
    full.scrollTop = 0;
    (five ? fiveHeading : fullHeading).focus({ preventScroll: !five });
  }
  toggle.addEventListener('click', () => full.hidden ? showFull() : showGuide());
  body.addEventListener('click', event => { if (event.target.closest('[data-guide-five]')) showFull(true); });
  back.addEventListener('click', () => { if (step > 0) { step--; showGuide(); } });
  next.addEventListener('click', () => {
    if (step === lessons.length - 1) dialog.close();
    else { step++; showGuide(); }
  });
  new MutationObserver(() => {
    if (dialog.open) { step = 0; showGuide(); }
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  dialog.addEventListener('close', () => {
    if (!dialog.open && !document.querySelector('dialog[open]')) returnFocus?.focus({ preventScroll: true });
  });
  showGuide(false);
}
