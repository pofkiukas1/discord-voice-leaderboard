// Harsh, varied Lithuanian trash talk for a private-friends leaderboard.
// Avoid generic throwaway lines; no identity-based hate slurs.
const INSULTS = [
  "riebalų pabaisa",
  "apsimyžęs kloune",
  "supistas lope",
  "mėšlagalvi",
  "šiknagalvi",
  "prasmirdęs šūdo maiše",
  "bybiagalvi",
  "šūdmali",
  "šūdų karaliau",
  "apgailėtinas padare",
  "nususęs menkysta",
  "pasipūtęs balvone",
  "apsišikęs nevykėli",
  "pasiklydęs šikniau",
  "gėdos fabrike",
  "supuvęs grybagalvi",
  "subingalvi",
  "apsmurgęs mulki",
  "beviltiškas nevykėli",
  "nevykėlių imperatoriau",
  "tragiškas lopeli",
  "šūdų malūne",
  "šūdinų pasiteisinimų meistre",
  "išpampęs egoiste",
  "pasikėlęs šūdmali",
  "apsnūdęs idiote",
  "šūdo princesėle",
  "supistas kliedesy",
  "suski",
  "išsižiojęs liurbi",
  "pasenęs kloune",
  "šūdų kapitone",
  "pigių pasiteisinimų fabrike",
  "apgailėtinas šikniau",
  "suknistas fanfarone",
  "tragiškas nuli",
  "pūvančios sėkmės likuti",
  "suknistas šlamšte",
  "prapiltų pergalių meistre",
  "supistas moliūge",
  "nulūžęs narcize",
  "apsišikęs genijau",
  "šūdų bokšte",
  "pasiklydęs tragike",
  "beviltiškas šūdžiau",
  "šūdų ambasadoriau",
  "skystas juokdary",
  "mėšlo imperatoriau",
  "išsipūtęs burbule",
  "sumautas žioply",
  "gėdos relikvija",
  "šūdinas išminčiau",
  "nevykėlių kolekcininke",
  "pasipūtęs durneli",
  "apsidergęs didvyri",
  "apgailėtinas nulėpausi",
  "supistas čempionėli",
  "visatos gėda",
  "pavargęs šūdo kalne",
  "mėšlinas vėpla",
  "užkalkėjęs nevykėli",
  "pasikėlęs mulki",
  "tragedijų laureate",
  "pigių pergalių svajotojau",
  "tuščias kibire",
  "supistas išsišokėli",
  "apgailėtinas juokdary",
  "sutrūnijęs kelme",
  "mėšlo maiše",
  "šūdo gabale",
  "apsisnargliavęs lopeli",
  "sugedęs smegenų likuti",
  "pasipūtęs vargšeli",
  "šūdų ministras",
  "suknistas pozuotojau",
  "gėdos kalne",
  "apgailėtinas šlamšte",
  "pralaimėjimų karaliau",
  "šūdų profesoriau",
  "suknistas balvone"
];
const TEMPLATES = [
  "Net tavo šešėlis tavęs išsižadėtų, {v}.",
  "Tavo rezultatas toks šūdinas, kad kanalizacija jo nepriimtų, {v}.",
  "Tu čia ne konkurentas, o viešas fiasko, {v}.",
  "Pralaimėjai taip gėdingai, kad net botui už tave gėda, {v}.",
  "Ar bent supranti, kaip stipriai susimovei, {v}?",
  "Tavo pasiteisinimai smirda blogiau už rezultatą, {v}.",
  "Gal nustok vaidinti didvyrį, {v}. Atrodai apgailėtinai.",
  "Net reitingo apačia tavęs nenori, {v}.",
  "Tu jau ne dugne, tu po juo, {v}.",
  "Šita lentelė tavo ego sumalė į šūdą, {v}.",
  "Tavo išpūstas ego nė velnio nepadėjo, {v}.",
  "Visas serveris mato, koks esi nevykėlis, {v}.",
  "Tu net pralaimėti nesugebi oriai, {v}.",
  "Gal geriau tylėk, {v}; nuo tavo pasirodymo net statistikai bloga.",
  "Tave aplenkė, kol tu maliai šūdą, {v}.",
  "Nieko vertas tavo puikavimasis, {v}.",
  "Atrodai kaip avarijos vieta, {v}.",
  "Čia ne varžybos, čia tavo ego laidotuvės, {v}.",
  "Savo šūdinas kalbas pasilik sau, {v}.",
  "Tu toks apsijuokęs, kad net gėdos jau nebejauti, {v}.",
  "Tau iki pergalės kaip šūdui iki torto, {v}.",
  "Per daug kalbi ir per mažai sugebi, {v}.",
  "Tavo rezultatas vertas tik vienos vietos – šiukšliadėžės, {v}.",
  "Tave aplenkė lengviau nei gulintį kelmą, {v}."
];
const DIRECT_ROASTS = [
  "Dek pragare, riebalų pabaisa.",
  "Šūdas, o ne tavo rezultatas. Šūdas, o ne tavo kova.",
  "Tavo rezultatas toks apgailėtinas, kad gėda net į statistiką žiūrėti.",
  "Tu ne čempionas, tu viešai transliuojamas susimovimas.",
  "Net tavo pasiteisinimai nuo tavęs pabėgo.",
  "Pasitikėjimo – kibirais, smegenų – vos ant dugno.",
  "Visas tavo šūdinas didingumas subliuško per vieną aplenkimą.",
  "Savo ego gali susikišti ten, kur saulė nešviečia.",
  "Tavo reitingas krenta greičiau už tavo savivertę.",
  "Žinai, kas dar labiau apgailėtina už tavo rezultatą? Tavo bandymas jį pateisinti.",
  "Tave aplenkė taip lengvai, kad net nepastebėjo kliūties.",
  "Tu čia reikalingas tik tam, kad kažkas nebūtų paskutinis.",
  "Visiško nevykėlio paminklas – tavo profilis šitoje lentelėje.",
  "Net prisijungęs visą parą liktum apgailėtinas.",
  "Tavo talentas mirė dar prieš prasidedant kovai.",
  "Šita lentelė tau ne varžybos, o nuolatinė vieša gėda.",
  "Toks šūdinas pasirodymas nusipelno atskiros kategorijos.",
  "Tu net savo šešėlio neaplenktum, jei jis nuspręstų pailsėti.",
  "Šūdų malimo karalius vėl prarado savo kartoninę karūną.",
  "Tavo progresas išėjo cigarečių ir daugiau niekada negrįžo.",
  "Nustok pūstis: tavo rezultatas mažesnis už tavo pasiteisinimų krūvą.",
  "Tu čia ne žaidėjas, o statistinė nelaimė.",
  "Net tavo avataras apsimetė, kad tavęs nepažįsta.",
  "Tokio lygio susimovimui reikėtų išduoti licenciją.",
  "Pagaliau atradai savo tikrą vietą – po kitais.",
  "Pasikėlęs iki debesų, o reitinge vis dar voliojiesi mėšle.",
  "Tavo sugebėjimai skamba garsiai tik tavo paties galvoje.",
  "Gėdos maiše, net botui gaila procesoriaus ciklų, skirtų tau skaičiuoti.",
  "Jeigu už šūdų malimą duotų taškų, seniai būtum pirmas.",
  "Tavo strategija buvo nejudėti ir tikėtis stebuklo? Sveikinimai, lope.",
  "Tu toks pasipūtęs, kad pralaimėjimas turėjo pradurti tavo ego.",
  "Tavo rezultatas smirda kaip savaitę saulėje gulėjęs kebabas.",
  "Net tavo internetas norėtų nutraukti su tavimi ryšį.",
  "Tavo reitingą reikia ne taisyti, o laidoti.",
  "Šitas aplenkimas – oficialus tavo šūdino pasirodymo antspaudas.",
  "Tu čia ne konkurencija, tu kitų žmonių apšilimas.",
  "Gal ir esi legenda, bet tik nevykėlių folkloro.",
  "Net pralaimėti sugebi taip, kad atrodo kaip profesija.",
  "Mažiau suknistų kalbų, daugiau rezultatų. Nors tau jau per vėlu.",
  "Tavo pasiekimai – didelė tuščia skylė su gražiu avataru.",
  "Kiek dar kartų reikės tave aplenkti, kad nustotum vaidinti kietą?",
  "Šūdinas tempas, šūdina taktika, šūdinas rezultatas. Tobulas trejetas.",
  "Tu tvirtai žygiuoji ne į pergalę, o į gėdos muziejų.",
  "Žiūrėk, net skaičiai tavęs nebegali pakęsti.",
  "Tavo savivertė bėga priekyje, o sugebėjimai šliaužia paskui.",
  "Su tavimi varžytis tas pats, kas apeiti ant kelio numestą šiukšlę.",
  "Visas tavo pasirodymas – vienas ilgas apgailėtinas atsiprašymas.",
  "Tave aplenkė, kol tu dar ieškojai, kur dingo tavo suknistas talentas.",
  "Pagal tavo tempą net amžinybė atrodo kaip sprintas.",
  "Tavo rezultatas toks gėdingas, kad norisi uždengti ekraną.",
  "Gali nebeaiškinti, vis tiek visi matė, kaip susimovei.",
  "Reitingo viršus tau tikriausiai atrodo kaip kita galaktika.",
  "Tavo pergalės planas užsikimšo tuo pačiu šūdu, kurį nuolat mali.",
  "Tokį pralaimėjimą reikėtų rodyti kaip perspėjimą.",
  "Ne gėda pralaimėti. Gėda pralaimėti TAIP.",
  "Visas serveris gavo nemokamą tavo ego griūties spektaklį.",
  "Tu čia kaip šiknos kamštis reitingo apačioje.",
  "Tavo suknistas pasitikėjimas nė kiek nepadėjo.",
  "Jei tavo rezultatas būtų maistas, jį išmestų net badaujanti žiurkė.",
  "Tavęs niekas nestabdė; tu tiesiog pats likai dulkėse.",
  "Net savo sėkmei esi per didelis nevykėlis.",
  "Visi juda pirmyn, o tu išdidžiai kapstaisi savo šūdų krūvoje.",
  "Šitas aplenkimas atėmė iš tavęs paskutinę progą pasirodyti rimtai.",
  "Tavo reitingas taip nusirito, kad jau reikia kasti.",
  "Tu šneki lyg monstras, o žaidi lyg išsikrovęs skaičiuotuvas.",
  "Net tavo šūdini pasiteisinimai turi geresnį tempą už tave.",
  "Tavo vieta lentelėje – paminklas tavo sugebėjimų trūkumui.",
  "Pasikėlęs menkysta, tavo didybė tebuvo vienas pigus pokštas.",
  "Tave aplenkė taip švariai, kad net nesupratai, kas nutiko.",
  "Ar bent vienas tavo pasiekimas nėra atsitiktinė klaida?",
  "Tu ne finišuoji paskutinis – tu nebežinai, kur finišas.",
  "Tavo pasirodymas toks supistas, kad net žemiau dugno yra aukščiau.",
  "Čia jau ne pralaimėjimas, o tradicija viešai apsijuokti.",
  "Tavo rezultatas atrodo kaip pažymys už šūdų malimą.",
  "Gal laikas pripažinti, kad tavo ego vienintelis čia sportuoja?",
  "Net botui reikia gilaus įkvėpimo, kad parodytų tavo statistiką.",
  "Tavo kietumas subliuško kaip pigus pripučiamas čiužinys.",
  "Tavo reitingas kaip kiauras kibiras – ką įpili, viskas išbėga.",
  "Tave aplenkė net nepersistengdamas. Tai turbūt skaudžiausia.",
  "Šita gėda tau tinka labiau už bet kokį apdovanojimą.",
  "Tavo progresas išgaravo kaip paskutinė smegenų ląstelė.",
  "Net tavo geriausias bandymas atrodo kaip nevykęs pokštas.",
  "Tokių rezultatų neslėpsi net po trimis pasiteisinimų sluoksniais.",
  "Tavo statistika turi vieną ryškią savybę – ji visus juokina.",
  "Dar truputį, ir tapsi oficialiu kanalo nesėkmių talismanu.",
  "Tavo šūdiną tempą galėtų lenkti net kalendorius.",
  "Tavo pergalės įgūdžiai tokie menki, kad jiems reikia mikroskopo.",
  "Pasipūtęs be pagrindo – klasikinis šūdmalių čempionas.",
  "Net reitingo skaičiai atrodo įsižeidę, kai pasirodai tu.",
  "Garbės nulis, triukšmo šimtas. Daugiau nieko.",
  "Tavo įgūdžiai kaip sugedęs liftas: garsiai ūžia, niekur nekyla.",
  "Tau iki pirmos vietos kaip apgailėtinam lopui iki stebuklo.",
  "Šūdas tau vietoj medalio, jei jau taip mėgsti pasigirti.",
  "Tavo reitingas – sąvartynas su interneto ryšiu.",
  "Visą laiką gireisi, o dabar tyliai šliaužk pro finišą.",
  "Už tokį rezultatą net virtualių taškų gaila.",
  "Jeigu pralaimėjimas būtų mokslas, būtum profesorius.",
  "Po tokio fiasko vienintelis sąžiningas titulas – metų nevykėlis.",
  "Tavo arogancija nuėjo pirma, o sugebėjimai paklydo pakeliui.",
  "Reitingas tave sumalė kaip šūdą po traktoriaus ratais."
];

export const ROASTS = Object.freeze([
  ...DIRECT_ROASTS,
  ...TEMPLATES.flatMap((template) => INSULTS.map((insult) => template.replace('{v}', insult))),
]);

export function snapshotTotals(rows, now = Date.now()) {
  return Object.fromEntries(rows.map((row) => [
    String(row.user_id),
    Math.max(0, Number(row.total_ms) + (row.started_at_ms == null
      ? 0 : Math.max(0, now - Number(row.started_at_ms)))),
  ]).filter(([, value]) => value > 0));
}

// A must have strictly less recorded time than B before, and strictly more after.
// Comparisons are based on actual milliseconds rather than tie-breaking IDs.
export function findOvertakes(previous, current, maxAnnouncements = 5) {
  if (!previous) return [];
  const ids = Object.keys(current).filter((id) => Object.hasOwn(previous, id));
  const events = [];
  for (const overtakerId of ids) {
    for (const passedId of ids) {
      if (overtakerId === passedId) continue;
      if (previous[overtakerId] < previous[passedId] &&
          current[overtakerId] > current[passedId]) {
        events.push({
          overtakerId,
          passedId,
          marginMs: current[overtakerId] - current[passedId],
        });
      }
    }
  }
  return events.sort((a, b) => b.marginMs - a.marginMs).slice(0, maxAnnouncements);
}

function shuffleIndices(rng = Math.random) {
  const values = Array.from({ length: ROASTS.length }, (_, i) => i);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

// A persistent shuffle bag: every roast is used once before any is repeated,
// and a reshuffle prevents a duplicate across the cycle boundary.
export function nextRoast(store, rng = Math.random) {
  const poolVersion = 'harsh-lt-v3';
  if (store.setting('roast_pool_version') !== poolVersion) {
    store.setSetting('roast_remaining', '[]');
    store.setSetting('roast_last_index', '-1');
    store.setSetting('roast_pool_version', poolVersion);
  }
  let bag;
  try {
    bag = JSON.parse(store.setting('roast_remaining') || '[]');
    if (!Array.isArray(bag) || bag.some((n) => !Number.isInteger(n) || n < 0 || n >= ROASTS.length)) bag = [];
  } catch {
    bag = [];
  }
  if (!bag.length) {
    bag = shuffleIndices(rng);
    const last = Number(store.setting('roast_last_index'));
    if (bag.length > 1 && bag.at(-1) === last) {
      [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
  }
  const index = bag.pop();
  store.setSetting('roast_remaining', JSON.stringify(bag));
  store.setSetting('roast_last_index', index);
  return ROASTS[index];
}

export function overtakeMessage(overtakerId, passedId, roast) {
  return `📈 <@${overtakerId}> aplenkė <@${passedId}>!\n${roast}`;
}
