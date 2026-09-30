# Konfigurator toreb papierowych — specyfikacja MVP

Źródło: wytyczne klienta (wrzesień 2026) + wywiad + oferta referencyjna
<https://www.promarjarocin.pl/torby-klockowe/>.

## 1. Cel

Zweryfikować proces: **wymiary + uchwyt + papier + grafiki → konfiguracja torby → realistyczny podgląd 3D**.
Najważniejsze: poprawne, dynamiczne mapowanie grafik na poszczególne ścianki modelu 3D.
Konfiguracja jest docelowo wejściem do wyceny, ale **cena nie jest implementowana w MVP**.

## 2. Zakres produktu

| Parametr | MVP | Źródło |
|---|---|---|
| Typ torby | `BLOCK` (klockowa) i `FOLDED` (fałdowa, od 30.09.2026 — §2a). Poniższe wiersze dotyczą torby klockowej | wytyczne |
| Szerokość | 75–260 mm, domyślnie 200 | Promar / wywiad |
| Wysokość | 170–430 mm, domyślnie 400 | Promar / wywiad |
| Głębokość | 40–300 mm (**do potwierdzenia**), domyślnie 150 | wywiad |
| Wariant uchwytu | brak (`NONE`) / wewnętrzny papier płaski (`FLAT_PAPER`) / wewnętrzny papier skręcany (`TWISTED_PAPER`) — pierwszy wybór w kroku 2; od niego zależą rodzaje papieru, gramatura, bariera i rozmiary standardowe | Promar [1–3] / wywiad |
| Kolor papieru | biały / brązowy (`WHITE` / `BROWN`) — niezależny od rodzaju papieru i uchwytu | Promar [0] |
| Rodzaj papieru — bez uchwytu | kraft (`KRAFT`), z recyklingu (`RECYCLED`), kredowany (`COATED`), powlekany folią (`FILM_COATED`), tłuszczoszczelny (`GREASEPROOF`) | Promar [1] |
| Rodzaj papieru — z uchwytem | płaski: mocny kraft lub z recyklingu; skręcany: jednowarstwowy kraft lub z recyklingu (`KRAFT` / `RECYCLED`) | Promar [2, 3] |
| Gramatura | bez uchwytu 50–120 g/m²; płaski 70–110 g/m²; skręcany 70–120 g/m²; krok 10 g/m² (założenie), domyślnie 80 | Promar [1–3] |
| Bariera na wilgoć | opcjonalnie, **tylko bez uchwytu** (`paper.moistureBarrier`) | Promar [1] |
| FSC® | opcjonalnie | Promar [0] |
| Rozmiary standardowe (szer. × gł. × wys.) — bez uchwytu | S: 80×45×220, 110×60×270; M: 120×70×200, 160×90×230; L: 180×110×260, 220×110×300; XL: 250×140×400, 320×220×400 (tylko opublikowane krańce klas) | Promar [1] |
| Rozmiary standardowe — uchwyt płaski | 180×85×230, 250×110×280, 200×140×400, 280×170×280, 320×110×400, 350×170×400, 450×170×470; pojemność 3–40 l | Promar [2] |
| Rozmiary standardowe — uchwyt skręcany | brak tabeli; pojemność 3–30 l | Promar [3] |
| Uchwyt (encja `Handle`) | materiał: mocny papier kraft (`material: 'KRAFT'`); płaski — wielokrotnie składany; domyślne wymiary per typ w `HANDLE_DEFAULTS` | Promar [2, 3] |
| Mocowanie uchwytu | oba typy przyklejane od wewnątrz płaską papierową łatką (`HandlePatch`) | Promar [2, 3] / wywiad |
| Nadruk | fleksografia, do 8 kolorów Pantone | Promar |
| Nakład | **usunięty z konfiguracji** (decyzja klienta 29.09.2026); min. 30 000 szt. to tylko informacja handlowa — nakład jest parametrem wyceny (`PricingEngine.quote(configuration, quantity)`), nie częścią `BagConfiguration` | Promar |
| Pakowanie | karton / folia | Promar |

Źródła: [0] <https://www.promarjarocin.pl/torby-klockowe/>,
[1] <https://www.promarjarocin.pl/torby-klockowe/bez-uchwytu/>,
[2] <https://www.promarjarocin.pl/torby-klockowe-z-uchwytem-wewnetrznym/>,
[3] <https://www.promarjarocin.pl/torby-klockowe/z-uchwytem-wewnetrznym-skrecanym/> (zweryfikowane 09.2026).

Reguły wariantu uchwytu i papieru:

- Zmiana wariantu uchwytu dopasowuje papier do nowego zestawu (`constrainPaperToVariant`): niedostępny rodzaj →
  domyślny wariantu (kraft), gramatura przycinana do zakresu, bariera na wilgoć wyłączana. UI informuje, co zmieniono.
- Rozmiar standardowy ustawia W/D/H przez ograniczenia store (`applyStandardSize`); rozmiary spoza limitów
  wymiarów są widoczne, ale nieaktywne (z wyjaśnieniem). Wymiary niepasujące do żadnego rozmiaru = „własny”.

Reguły wymiarów i kształtu:

- Wymiary podawane **co 5 mm** (`DIMENSION_STEP_MM`, błąd `NOT_ON_STEP`).
- **Głębokość ≤ szerokość** — szerokość to zawsze dłuższa krawędź podstawy (błąd `DEPTH_EXCEEDS_WIDTH`).
- Uchwyty montowane **wyłącznie na ściankach przedniej i tylnej** (na szerokości).
- **Góra torby jest otwarta** (pusta) — w 3D i na ikonach. Na razie bez zawinięcia górnej krawędzi.
- **Blokada**: nie da się ustawić szerokości mniejszej niż głębokość (ani głębokości większej niż szerokość) — efektywne min/max pól zależą od drugiego wymiaru, store nigdy nie przechowuje takiej kombinacji.
- **Zapas na dno** (reguła od klienta): każda ścianka rękawa (przód, tył, oba boki) jest przedłużona poniżej linii dna o `(30 mm + głębokość) / 2`. Długość odcinka rękawa = `wysokość + (głębokość + 30) / 2` (np. D = 150 → zapas 90 mm).
- Dno tworzy zawinięcia (klapy dna) — szczegóły konstrukcyjne w `docs/PRODUCTION.md`.
- Przy polach wymiarów ikony pokazujące kierunek wymiaru (szerokość / wysokość / głębokość) na szkicu torby z otwartą górą.

Wszystkie zakresy i listy opcji żyją w `src/domain/config/productCatalog.ts` — nigdy w komponentach.

### 2a. Torba fałdowa (`FOLDED`) — MVP 30.09.2026

Torebka z fałdami bocznymi i dnem zaginanym na tył (bez dna klockowego). Wiążące: **wytyczne techniczne klienta
„Torba fałdowa – wytyczne techniczne” (30.09.2026) [K]**; tło: research oferty Promar
(`docs/research/promar-gusseted-bags.md`). Konstrukcja, wykrój i status każdej wartości: `docs/PRODUCTION.md` §13.

| Parametr | MVP |
|---|---|
| Zapis wymiaru | **„W + F × H”**, np. „140 + 90 × 370 mm” [K] — podsumowanie, karta PDF / Excel, wykrój, nazwy plików (`140+90x370`) |
| Szerokość `W` | 100–300 mm, krok 5, domyślnie 140 [K] |
| Wysokość `H` (od zagięcia dna do wylotu) | 170–670 mm, krok 5, domyślnie 370 [K] |
| Fałda `F` (pełna; pole „Fałda” zamiast „Głębokość”) | twarde maksimum `F ≤ W` (blokada jak w torbie klockowej), zalecane 0,4–0,7·W (ostrzeżenie), minimum 20 mm, krok 5, domyślnie 90 [K] |
| Uchwyt | brak (tylko wariant „bez uchwytu”; w kroku 2 informacja „bez uchwytów”) |
| Papier | kraft biały / brązowy, kraft MG, tłuszczoszczelny, powlekany PE; 30–60 g/m², krok 5, domyślnie 40; FSC opcjonalnie; bez osobnej bariery na wilgoć [K] |
| Rozmiary standardowe | brak |
| DEMO | przycisk DEMO wczytuje demo wybranego typu: przykład klienta 140 + 90 × 370, papier brązowy 40 g/m² FSC, grafiki `public/gusseted-bag/{front,back,left,right}.webp` (brakujące są pomijane) |
| Nadruk / pakowanie | flekso do 8 Pantone, **pole nadruku `W × (H − d)` na stronę**; karton / folia [K] |
| Szew | zakładka `s` 10–20 mm, domyślnie 15, **na krawędzi tył | fałda lewa, jak w torbie klockowej** [K] (decyzja 30.09.2026; wariant „szew na środku tylnej ścianki” nie jest używany); pole „zakładka klejowa” jak w torbie klockowej (`glueFlapWidth`); przy zmianie typu wartość domyślna przechodzi na domyślną nowego typu, wybrana przez użytkownika jest tylko przycinana do zakresu |
| Dno | pasek `d = 25 mm` (15–30) z klejem, zagięty **na tył**, pojedyncze [K]; bez nadruku („Rozciągnij na dno” niedostępne) |

- **Zmiana typu** (`changeProductType`, akcja `setProductType`) nie zeruje konfiguracji: zachowuje grafiki (ścianki
  i wszystkie warstwy całej torby), kolory nadruku, kolor papieru, FSC; usuwa niedostępny uchwyt, przycina wymiary do
  zakresu nowego typu (z regułą `F ≤ W`), dopasowuje papier do wariantu i wyłącza „Rozciągnij na dno” (na ściankach i
  na każdej warstwie). UI wypisuje, co zmieniono. Przycisk DEMO zaczyna od nowej konfiguracji (`resetConfiguration`).
- **Wykrój:** arkusz `B × L = (2W + 2F + s) × (H + d)`, **kolumny od lewej jak w torbie klockowej [K]** (30.09.2026):
  LEFT | FRONT | RIGHT | BACK | zakładka `s` (bigi po `F/2, F/2, W, F/2, F/2, W, s`; BACK w całości); krawędzie
  rękawa na zewnątrz (V), osie fałd do środka (M), linia dna V / M zależnie od warstwy; klej na zakładce i na pasku
  dna. Przykład 140 + 90 × 370 → 475 × 395 mm, bigi na x = 45, 90, 230, 275, 320, 460.
- **Wycena / eksport:** typ i jego parametry w Podsumowaniu (JSON), karcie PDF i Excelu jak dla torby klockowej
  (etykiety „Fałda (F)”, „Pas dna (d)”, „Zakładka szwu (s)”, „Pole nadruku (na stronę)”); waga torby z wykroju
  `B × L`; wycena nadal niezaimplementowana (§1).

## 3. Ścianki i grafiki

- Ścianki: `FRONT`, `BACK`, `LEFT`, `RIGHT` (opcjonalnie w przyszłości `BOTTOM`, `TOP`).
- Każda ścianka to osobny `BagPanel` z opcjonalnym `Artwork` i `ArtworkPlacement`.
- Upload per ścianka: drag&drop lub wybór pliku, miniatura, usuń / zamień.
- Walidacja pliku: PNG / JPG / WEBP, maks. rozmiar (`ARTWORK_RULES`), plik musi dać się zdekodować jako obraz/tekstura.
- Przyszłe formaty (PDF, AI, SVG, TIFF) — tylko przewidziane w modelu, nie implementowane.

### Dopasowanie grafiki (decyzja z wywiadu)

- MVP: tryb `FILL` — grafika mapowana na całą ściankę (UV 0..1). Brak cover/contain.
- UI powinien ostrzegać, gdy proporcje grafiki różnią się od proporcji ścianki (grafika będzie zdeformowana).
- Docelowo: **moduł pozycjonowania grafiki** (przesunięcie, skala, obrót, cover/contain). `ArtworkPlacement` jest
  punktem rozszerzenia — mapowanie UV musi być liczone przez wymienną funkcję strategii, nie zaszyte w geometrii.
- **Moduł pozycjonowania (29.09.2026, wykrój 2D „podgląd + edycja”):** `ArtworkPlacement` = `{ mode: 'FILL' }` (domyślnie)
  lub `{ mode: 'CUSTOM', offsetX, offsetY, scale, rotation }` — przesunięcie środka grafiki względem środka ścianki
  w mm, `scale` względem dopasowania „contain” (1 = cała grafika mieści się w ściance, bez deformacji), obrót co 90°.
  Szybkie akcje: rozciągnij (FILL), dopasuj (contain), wypełnij (cover), reset. Wspólna funkcja
  `computePanelUvTransform` (`src/domain/artworkPlacement.ts`) liczy transformację tekstury dla 3D i macierz obrazu
  dla wykroju 2D. Nowa grafika na ściance zaczyna od FILL. Poza ścianką grafika jest przycinana (w 3D: goły papier).

### 3a. Grafika na całą torbę (prośba klienta 30.09.2026)

„Opcja dodania 1 grafiki reprezentującej całą torbę zamiast każdej ze ścian.” Rozszerzone o warstwy (§3b).

- **Model:** `BagConfiguration.artworkLayout: 'PER_PANEL' | 'WRAP'` (lista w katalogu: `ARTWORK_LAYOUTS`, domyślnie
  `PER_PANEL`) + `BagConfiguration.wrapLayers` — uporządkowana lista warstw (§3b), każda z tym samym `Artwork` i tym
  samym `ArtworkPlacement` (FILL / CUSTOM, `extendToBottom`) co na ściance. Brak pól w starszych danych = `PER_PANEL`
  (`getArtworkLayout`, `getWrapLayers`).
- **Mapowanie (decyzja klienta [K] 30.09.2026):** grafika **zaczyna się na lewej krawędzi przodu** i biegnie dookoła
  torby: **FRONT | RIGHT | BACK | LEFT** (x = 0 na lewej krawędzi przodu; LEFT jest ostatni i kończy się na narożniku
  przód / lewy bok). **Zakładka klejowa bez nadruku [K]** (idzie pod spód; poza 2 mm zachodzenia jak przy każdej
  ściance). Obszar grafiki = `(2W + 2D) × H` (`getWrapArtworkArea`); **góra** = górna krawędź torby (+ spad 3 mm na
  wykroju); **dno**: przełącznik „Rozciągnij na dno” (osobno dla każdej warstwy) — obszar `(2W + 2D) × (H + a)`,
  grafika wchodzi w zapas na dno pod wszystkimi ściankami (klapy, trójkąty, uszy), jak w §4f. FILL rozciąga obraz na
  cały obszar; CUSTOM (przesunięcie / skala / obrót / wyrównanie) liczy się względem środka całego obszaru.
- **Grafika cykliczna (zgłoszenie klienta 30.09.2026: „nie mogę przesunąć obrazka na przełamanie pomiędzy lewą a
  przednią ścianką”):** torba to obwód, więc grafika warstwy powtarza się co `P = 2W + 2D` — obraz leży w x + k·P,
  a każda kopia jest ograniczona do jednego okresu wokół środka obrazu (obraz szerszy niż torba nie nachodzi sam na
  siebie; `getWrapImageExtent`). Obraz przesunięty w lewo za lewą krawędź przodu pojawia się na końcu lewego boku
  (i odwrotnie). Obszar grafiki jest już tylko odniesieniem dla FILL / dopasowania / wyrównania / środka i przycina
  **pionowo** (z „Rozciągnij na dno” lub bez); **poziomo** kopię przycina ścianka (kolumna) i jej zasięg (`clipX`).
  `offsetX` warstwy jest zawijany do jednego okresu `[−P/2, P/2)` (`periodicX` w obszarze, `normalizePlacement`) zamiast
  przycinania, więc przeciąganie przez narożnik jest ciągłe (obraz nie skacze, zmienia się tylko zapis przesunięcia).
- **Jedna ścieżka dla wszystkich odbiorców:** `resolvePanelArtwork(s)` (`src/domain/artworkLayout.ts`) zwraca dla
  każdej ścianki listę warstw (od spodu) z grafiką, placementem i obszarem grafiki w jej współrzędnych — dla warstwy
  całej torby osobny wpis na każdą kopię widoczną na ściance (zwykle jeden, dwa przy obrazie na narożniku), z polami
  `clipX` (zasięg kopii) i `stackIndex` (miejsce w stosie). Obszar to szerszy obszar przesunięty o położenie ścianki
  dookoła torby (`getWrapPanelOffset`: FRONT 0, RIGHT W, BACK W + D, LEFT 2W + D) i o k·P. Renderer 3D (ścianki, części
  dna, elementy arkusza), wykrój 2D, pokrycie farbą i eksport korzystają z tego samego `computePanelUvTransform`, więc
  obraz jest ciągły na wszystkich krawędziach ścianek (także na narożniku LEFT | FRONT) i łamie się na bigach.
- **Wykrój 2D:** kolumny arkusza pozostają w kolejności **LEFT | FRONT | RIGHT | BACK | zakładka**. Kolumny, w których
  kopie leżą w tym samym miejscu arkusza, tworzą jeden obraz: FRONT…BACK, a obraz przechodzący przez narożnik LEFT |
  FRONT (lewy bok leży na arkuszu tuż na lewo od przodu) — jeden obraz przez obie kolumny. Kolumna LEFT z końcem grafiki
  i obraz na szwie BACK | LEFT (rozdzielony między końce arkusza) to osobne elementy tego samego obrazu. Przycięcie:
  kolumna (+ 2 mm zachodzenia / spad) ∩ zasięg kopii (+ 2 mm); zakładka klejowa zawsze bez nadruku. Elementy niewidoczne
  są pomijane. Przeciąganie / skalowanie / klawisze działają na warstwie — wszystkie jej elementy przesuwają się razem.
  Obszar zaznaczonej warstwy to wszystkie ścianki. Plik użyty kilka razy jest osadzany w SVG raz (`<image>` w `<defs>`
  + `<use>`).
- **Przełączanie układu** nie usuwa grafik drugiego układu (wracają po przełączeniu; UI o tym informuje), ale
  drukowane / liczone / eksportowane są tylko grafiki aktywnego układu. JSON konfiguracji zawiera oba sloty.

### 3b. Warstwy grafiki całej torby (decyzja klienta 30.09.2026)

„Wiele grafik tylko w trybie całej torby; zachowują się jak warstwy z kolejnością (tło + logo + kod kreskowy…),
każdą można osobno przesuwać / skalować / obracać / wyrównać na wykroju; FILL dostępny per warstwa.” Tryb per
ścianka bez zmian (jedna grafika na ściankę).

- **Model:** `BagConfiguration.wrapLayers: WrapArtworkLayer[]` — `{ id, artwork, placement }`, kolejność **od spodu
  do wierzchu** (późniejsze drukowane na wierzchu). `id` stały (zmiana kolejności, podmiana, zaznaczenie). Limit
  `MAX_WRAP_ARTWORK_LAYERS = 8` (katalog). Cel grafiki w akcjach store / edytorze: `ArtworkTarget = PanelPosition |
  'WRAP:<id warstwy>'` (`wrapLayerTarget`, `getWrapLayerId`).
- **Zgodność wstecz:** dane zapisane przed warstwami mają jedno pole `wrapArtwork: { artwork, placement }`.
  `getWrapLayers` czyta je jako listę jednoelementową (id `wrap-<id grafiki>`, stałe dla tych samych danych; pusty
  slot = brak warstw); `withWrapLayers` zamienia zapisaną konfigurację na bieżący kształt (usuwa stare pole, przycina
  listę do limitu).
- **Nowa warstwa:** pierwsza (zwykle tło) — FILL na całą torbę; kolejne (logo, kod…) — dopasowane (contain) do
  **przodu** i wyśrodkowane na nim (`getNewWrapLayerPlacement`), żeby nie zasłoniły tła ani nie były rozciągnięte.
  „Rozciągnij na dno” — wartość domyślna `ARTWORK_EXTEND_TO_BOTTOM_DEFAULT`.
- **Store:** `addWrapLayer` (na wierzch; zwraca id albo `null` przy limicie — wtedy URL obiektu jest zwalniany),
  `removeWrapLayer`, `moveWrapLayer(id, ±1)`, podmiana `setPanelArtwork('WRAP:<id>', artwork)` (to samo id, miejsce w
  stosie i placement; stary URL zwalniany), edycja placementu tymi samymi akcjami co ścianki (`setPanelPlacement`,
  `alignPanelArtwork`, `setPanelExtendToBottom`, `fillPanelPlacement`, `resetPanelPlacement`). Zaznaczenie do edycji
  to stan widoku (`configuratorUiStore.selectedArtwork`), wspólny dla listy warstw i edytora wykroju.
- **3D:** ścianka z jedną warstwą — jak dotąd (widok wspólnej tekstury obrazu z własną transformacją UV). Ścianka z
  kilkoma warstwami — **jedna tekstura z płótna (canvas) na ściankę**: warstwy (i kopie cyklicznego obrazu) rysowane od spodu,
  przycięte poziomo do ścianki i zasięgu kopii, pionowo do obszaru (bez „Rozciągnij na dno” nie wchodzi pod linię
  dna), plan kompozycji liczony w domenie
  (`planArtworkComposite`, `src/domain/artworkComposite.ts`: ramka = ścianka + zapas na dno, jeśli któraś warstwa go
  obejmuje; macierz i przycięcie każdej warstwy z `computePanelUvTransform`). Kompozyt mapowany jak jedna grafika FILL
  na ramkę, więc części dna i arkusza działają bez zmian, bez nakładania siatek (brak z-fightingu). Rozdzielczość wg
  najdokładniejszej warstwy, maks. 2048 px dłuższego boku (i limit GPU); każdy obraz ładowany raz dla całej torby;
  płótno rysowane dopiero, gdy wszystkie obrazy są wczytane (zrzuty do PDF nie łapią połowicznych kompozytów),
  zwalniane przy zmianie rozmiaru / odmontowaniu.
- **Wykrój 2D:** każda warstwa to osobny element (osobne przycięcie), w kolejności od spodu; zaznaczenie, przeciąganie,
  uchwyty skali, klawisze i pasek edycji działają na zaznaczonej warstwie. Kliknięcie w miejscu, gdzie zaznaczona
  warstwa jest widoczna pod inną, dalej przesuwa zaznaczoną (tło wybrane z listy da się przesunąć „przez” logo).
- **Pokrycie farbą:** liczone z **kompozytu** — w każdej komórce siatki warstwy składane jak na ekranie (alfa
  „over”), więc logo na tle zastępuje farbę tła zamiast się do niej dodawać; półprzezroczysta warstwa miesza kolor z
  warstwą pod spodem.
- **Eksport:** PDF — w parametrach każda warstwa (od spodu) z plikiem i położeniem; Excel „Ścianki i grafiki” —
  wiersz na warstwę (wymiar `(2W + 2D) × H`, plik, px, tryb, przesunięcia, skala, obrót, rozciągnięcie na dno).
- **UI (krok Grafiki, tryb całej torby):** lista warstw od wierzchu (jak w programach graficznych): miniatura, nazwa
  „Warstwa N”, plik, skrót położenia; przyciski wyżej / niżej, Zamień, Usuń, „Edytuj na wykroju” (dla zaznaczonej);
  pole „Dodaj warstwę” (przeciągnij / wybierz plik, ta sama walidacja co przy ściankach); ostrzeżenie o proporcjach
  dla warstw FILL; komunikat o limicie.


## 4. Podgląd 3D

- React Three Fiber + drei; model generowany proceduralnie z `width/height/depth` (bez statycznych modeli).
- Obrót, zoom, pan, oglądanie wszystkich stron; neutralne tło; oświetlenie pokazujące kształt i grafikę.
- Natychmiastowa reakcja na zmianę wymiarów, uchwytu, koloru papieru i grafik.
- Kolor papieru (biały / brązowy) = bazowy kolor materiału ścianek bez grafiki.
- Uchwyty: skręcany = rura po krzywej (`TubeGeometry`), płaski = płaska taśma; obie z łatką od wewnątrz.
- Renderer jest wyłącznie widokiem: czyta `BagConfiguration`, nie przechowuje własnego źródła prawdy.
- Obiektowe URL-e i tekstury muszą być zwalniane (`URL.revokeObjectURL`, `texture.dispose()`).

### 4a. Podgląd złożenia (wywiad, 29.09.2026)

Suwak **„Składanie” 0–100%** to jedna ciągła oś czasu (decyzja klienta 29.09.2026): **płaski arkusz (0 %)** → rękaw
(faza A) → boki dna do środka w całości (B) → trapez przedni (C1) → trapez tylny na wierzch (C2) → **uformowana torba
(40 %, „3D pełne”)** → stojąca („3D po zgięciu”, 45 %) → **złożona na płasko (100 %)**. Część 0–40 % to składanie z arkusza
(`assemblyKinematics.ts`, `docs/PRODUCTION.md` §10.8), część 40–100 % to dotychczasowe złożenie na płasko (§10.5,
przemapowane). Podział 40/60 trzyma wszystkie presety na siatce 1 % (0 / 0,4 / 0,55 / 1). Obok suwaka nazwa bieżącego
etapu i przycisk odtwórz / pauza (cała oś w ok. 14 s; odtwarzanie z końca zaczyna od arkusza). W stanie widoku
(`previewStore`) jest jedna wartość `progress`; `getTimelineState` wylicza z niej postęp składania, postęp złożenia i etap.
Model dna klienta [K] (`docs/PRODUCTION.md` §3.4): strefy dna boków składają się w całości (bez bigów), strefy przodu
i tyłu mają bigi 45° (C9) — trapez + narożne trójkąty, które przy wchodzeniu boków obracają się o 180° na C9 (zginając
się po dwusiecznej na zewnątrz) i leżą między klapą boku a trapezem. Fazy B → C1 → C2 są ściśle po kolei; warstwy od
środka: klapy boków → trapez przedni → trapez tylny (w 3D odsunięte o 0,1 mm na warstwę na zewnątrz).

Geometria linii zgięcia (bigów) na ściance bocznej LEFT/RIGHT o wymiarach `depth × height`:

```text
   ┌────┬────┐  ← góra
   │    │    │
   │ L  │  R │     pionowa linia środkowa x = depth/2, od wierzchołka do góry
   │    │    │
   │   / \   │  ← wierzchołek (depth/2, depth/2)
   │ /  T  \ │     dwie linie 45° z dolnych narożników (dwusieczne kątów)
   └─────────┘  ← dół (krawędź z dnem)
```

- Regiony L i R są zawiasowo połączone z krawędzią przodu/tyłu i ze sobą (linia środkowa). Przy złożeniu
  pod kątem θ (0 → 90°) linia środkowa cofa się do środka o `depth/2 · sin θ`, a odległość przód–tył wynosi
  `depth · cos θ`. Przód i tył pozostają płaskie.
- Dno (`width × depth`): wiernie, jak w torbie klockowej — obraca się na tylnej dolnej krawędzi i kładzie
  płasko na tylnej ściance. Trójkąty T składają się razem z dnem. Jeśli pełna kinematyka okaże się zbyt
  kosztowna, dopuszczalne uproszczenie w drugiej kolejności, po konsultacji.
- Grafika na bokach **załamuje się razem z papierem**: podział ścianki na regiony zachowuje ciągłe UV całej
  ścianki, więc obraz jest ciągły w stanie rozłożonym i łamie się na bigach.
- Widoczne linie bigowania (subtelne) na bokach i przy dnie.
- Zmiana wartości suwaka jest animowana (płynne dojście do wartości docelowej).
- Stan złożenia to **stan widoku**, a nie konfiguracji produktu — nie trafia do `BagConfiguration`
  (osobny `previewStore`). Geometria bigów to natomiast wiedza produktowa (przyszłe wykrojniki) —
  liczona w `src/domain` jako czysta geometria 2D.

> **Korekta (wg `docs/PRODUCTION.md` §10):** w stanie złożonym dno obraca się na przedniej krawędzi dna i kładzie na **zewnętrznej stronie tylnej ścianki**; tylna ściana łamie się w „Z” na bigu `y = D/2`, więc górne krawędzie pozostają równo. Na tylnej połowie boku jest dodatkowy poziomy big od krawędzi do wierzchołka. Model kinematyczny i wzory — `docs/PRODUCTION.md` §10.5; ma pierwszeństwo przed opisem powyżej.

### 4i. Podgląd 3D torby fałdowej (MVP 30.09.2026)

- Osobny model (`src/renderer/GussetedBagModel.tsx`, geometria `gussetedBagGeometry.ts` z kinematyki domenowej
  `src/domain/geometry/gussetedBag.ts`), niezależny od modelu torby klockowej; tekstury ścianek (jedna grafika albo
  kompozyt warstw) ze wspólnego `wallTextures.ts`. Ścianki: przód, tył i dwie fałdy, bigi osi fałd, krawędzie (szew na
  krawędzi tył | fałda lewa, jak w torbie klockowej [K]), pasek dna zagięty na tył (goły papier) [K].
- **Otwarta torba:** wylot `W × F`, zwężenie do linii dna — fałdy otwierają się od 0 przy przyklejonym dnie do 90°
  na wysokości `d + min(F, H/2)`. **Złożona:** płasko (warstwy rozsunięte tylko o grubość renderu).
- **Oś czasu (decyzja MVP):** składanie z arkusza pominięte. Przedział 0–40 % pokazuje otwartą torbę, więc suwak
  zaczyna się od 40 %, odtwarzanie startuje od 40 %, a preset „Arkusz” jest ukryty. 40 % („3D pełne”) = otwarta,
  45 % („3D po zgięciu”) = lekko przymknięta, 100 % („Złożona”) = płaska. Etap: „Torba uformowana” / „Składanie na
  płasko”. Zrzuty 3D w karcie PDF używają tego samego modelu. Kolejność produkcji z wytycznych klienta (rękaw + fałdy,
  szew, cięcie, dno) jest opisana w `docs/PRODUCTION.md` §13.1 na przyszłą animację.

### 4c. Tryby podglądu (wywiad 29.09.2026)

Przełącznik trybów w panelu podglądu:

1. **Wykrój 2D** — płaski arkusz z grafikami (podgląd + edycja: przesuwanie/skalowanie grafiki na ściance). Osobny widok, poza osią czasu.
2. **Arkusz** — wykrój w 3D, wszystkie ścianki w jednej płaszczyźnie, grafika widoczna (początek osi czasu, 0 %).
3. **3D pełne** — uformowana torba, prostopadłościan (koniec składania z arkusza, 40 %; foldProgress = 0).
4. **3D po zgięciu ścianek** — „naturalnie stojąca” torba: boki cofnięte na bigach względem krawędzi przodu/tyłu, dolny trójkąt ok. 45° do osi Z (preset kinematyki). Zdefiniowane jako `p`, przy którym dolny trójkąt boku (od środka podstawy do wierzchołka) jest odchylony o 45° od pionu; wyznaczone bisekcją ≈ 0,2497 niezależnie od wymiarów, zaokrąglone do **0,25** (na osi czasu: 0,4 + 0,6 · 0,25 = 55 %). **Przycisk „3D po zgięciu” ustawia jednak 45 %** (p = 1/12, decyzja klienta 30.09.2026). Uwaga: w tym stanie model jednoparametrowy unosi tylną krawędź dna o φ ≈ 8,4° (ok. 22 mm przy D = 150).
5. **3D złożona na płasko** — foldProgress = 1 (100 %).

Tryby 3D to **presety na osi czasu**; przełączenie animuje przejście przez wszystkie etapy pomiędzy (np. z „Złożona” do „Arkusz”). **Suwak** (tylko w trybach 3D) pozwala przejść całą oś płynnie; jego przesunięcie odznacza tryb, chyba że wartość trafi dokładnie w preset. Grafiki w 3D widoczne na ściankach i łamią się na bigach. Grafiki dodawane **per ścianka** albo jako **grafika na całą torbę** w warstwach (§3a, §3b).

### 4d. Pokrycie farbą (wywiad 29.09.2026)

W kroku **Grafiki**, aktualizowane na żywo:

- **Pokrycie farbą łącznie** — procent powierzchni **arkusza (wykroju)** faktycznie pokrytej farbą, liczony z pikseli grafik po pozycjonowaniu (`ArtworkPlacement`), przyciętych do ścianek.
- **Pokrycie per kolor Pantone** — rozbicie na kolory z listy nadruku (krok 4); każdy piksel z farbą przypisany do najbliższego koloru z listy (każdy kolor Pantone ma przypisany podgląd RGB/HEX wybierany przez użytkownika).
- „Brak farby”: piksele przezroczyste; na papierze **białym** także piksele bliskie bieli; na papierze **brązowym** biel jest farbą (biały nadruk).
- Wynik to przybliżenie do wyceny (zużycie farby), nie separacja produkcyjna. Liczenie jako czysta funkcja domenowa na tablicach pikseli (testowalna), próbkowanie na zmniejszonych obrazach.

**Model i algorytm (implementacja 29.09.2026):**

- `PrintSpec.pantoneColors: { code, hex }[]` — kod Pantone + kolor podglądu `#rrggbb` (wybierany w kroku 4 próbnikiem koloru). Przy dodaniu kodu podpowiadany jest kolor: przybliżenie dla popularnych kodów (`PANTONE_PREVIEW_SUGGESTIONS` w katalogu), inaczej pierwszy nieużyty kolor z palety zastępczej. Pantone → RGB jest przybliżone.
- `computeInkCoverage` (`src/domain/printCoverage`): każda widoczna ścianka (prostokąt ścianki kolumny wykroju z `buildDieline`) jest próbkowana siatką w mm (256 komórek na dłuższym boku ścianki); środek komórki → współrzędne tekstury przez `computePanelUvTransform` (to samo mapowanie co 3D i wykrój 2D) → piksel próbki. Poza obrazem = goły papier.
- **Nie liczą się:** spad, zakładka klejowa oraz zapas na dno ścianek **bez** „Rozciągnij na dno” (tam grafika jest przycinana do ścianki). Zapas na dno ścianek z rozciągnięciem **jest liczony** (§4f). Mianownik = powierzchnia arkusza bez spadu (z zakładką i zapasem na dno).
- Klasyfikacja piksela: alfa < 8/255 → brak farby, powyżej — farba ważona alfą; „bliski bieli” = ΔE76 do bieli ≤ 8 (tylko na papierze białym); przypisanie do najbliższego podglądu Pantone w CIELAB (ΔE76). Pusta lista Pantone → tylko wynik łączny („bez przypisanego koloru”) + podpowiedź. Jeśli > 10 % farby ma ΔE > 30 do najbliższego podglądu — podpowiedź „kolory odległe od listy” (farba nadal liczona do najbliższego koloru). Progi w `PRINT_COVERAGE_RULES`.
- UI: próbka każdej grafiki dekodowana raz na `fileUrl` (maks. 256 px na dłuższym boku, `createImageBitmap` z przeskalowaniem, cache), przeliczenie z opóźnieniem 200 ms w `requestIdleCallback`.
- Ograniczenia: fotografie / przejścia tonalne są przypisywane „na najbliższy kolor” (bez rastra i nakładania farb), więc suma per kolor = pokrycie łączne i nie przekracza 100 %; biała farba pod innymi kolorami na brązowym papierze (podkład) nie jest liczona osobno.

**Kolory w grafikach (HEX) — łączenie podobnych kolorów (decyzja klienta 29.09.2026):**

- Problem: surowe piksele zawierają wiele prawie identycznych odcieni (wygładzanie krawędzi, kompresja JPEG, przejścia tonalne, drobne plamki). Rozwiązanie: łączenie podobnych kolorów, sterowane ustawieniem zapisanym w konfiguracji `PrintSpec.colorAnalysis = { mergeTolerance, minAreaShare }` (domyślnie `COLOR_ANALYSIS_DEFAULTS`: ΔE00 10 i 0,5 % farby; brak pola w starszych danych → wartości domyślne przez `normalizeColorAnalysis`; akcja store `setColorAnalysis`, wartości przycinane do `COLOR_ANALYSIS_LIMITS`). Te same wartości trafiają do tabeli w UI, do Podsumowania / JSON i do eksportu PDF / Excel (parametry + uwaga pod tabelą kolorów z użytą tolerancją i „N odcieni połączono w M kolorów”).
- Algorytm `computeArtworkPalette` (deterministyczny): (1) próbkowanie jak w pokryciu farbą, każdy odrębny kolor sRGB = „odcień” z powierzchnią; (2) histogram (5 bitów/kanał, zmniejszany do ≤ 512 niepustych komórek dla fotografii); (3) **łączenie aglomeracyjne**: najbliższa para grup łączona, dopóki jej **CIEDE2000 ΔE00** < tolerancja; kolor grupy = średnia Lab ważona powierzchnią (ΔE00 zamiast CIE76, bo jedna tolerancja działa podobnie dla kolorów nasyconych i szarości); (4) **krawędzie wygładzane** (tolerancja > 0): odcień leżący w sRGB na odcinku między dwoma znacznie większymi kolorami (lub kolorem a białym papierem) to ich mieszanka — przypisany do bliższego końca; prawdziwy trzeci kolor chroni jego wielkość (> 10 % mniejszego z końców); (5) kolory < minimalnej plamy dołączają do najbliższego koloru z listy w promieniu 2 × tolerancja ΔE00, inaczej trafiają do „inne” (przy tolerancji 0 zawsze do „inne” — dawne zachowanie); (6) maks. 16 kolorów. **HEX** to rzeczywisty kolor piksela: najczęstszy odcień grupy w promieniu max(2, tolerancja / 2) ΔE00 od średniej (albo odcień najbliższy średniej). Nazwa najbliższego Pantone jak dotąd (ΔE76 do podglądu).
- UI (sekcja „Kolory w grafikach (HEX)” w panelu pokrycia): suwak „Łączenie podobnych kolorów” 0–30 ΔE00 („dokładnie” ↔ „mocno łącz”), lista „Minimalna plama koloru” (bez limitu, 0,1 %, 0,25 %, 0,5 %, 1 %, 2 % farby), komunikat „12 odcieni połączono w 4 kolory”; przeliczenie na żywo z tym samym opóźnieniem (zmiana tylko ustawień przelicza samą paletę).

### 4b. Wykrój (dieline) — wywiad 29.09.2026

Płaski rozkład arkusza jednej torby generowany z konfiguracji.

- **Wyjścia:** podgląd 2D w UI (obok / zamiennie z 3D), eksport **SVG** (warstwy wg klienta: `cut` — czerwona linia, `crease_valley`, `crease_mountain`, `glue`, `print` — grafika, oraz `annotations`; bigi V / M widziane od strony druku, `docs/PRODUCTION.md` §9.3), eksport **PDF** (skala 1:1, mm).
- **Geometria:**
  - ścianki w rzędzie rękawa w kolejności **LEFT | FRONT | RIGHT | BACK | zakładka klejowa wzdłużna** (BACK w jednym kawałku); **szew na krawędzi rękawa między BACK a LEFT**, **zakładka 10 mm** doczepiona do zewnętrznej krawędzi BACK i klejona do wolnej krawędzi LEFT — decyzja klienta (29.09.2026), stała w `productionRules.ts`; szczegóły w `docs/PRODUCTION.md` §9 (np. 200 × 400 × 150 → arkusz 710 × 490 mm),
  - wysokość arkusza = `H + (D + 30) / 2` (zapas na dno pod każdą ścianką),
  - linie bigowania: krawędzie ścianek, linia dna, bigi fałd bocznych (środek + 45°), bigi 45° trapezów dna przodu i tyłu (C9; strefy dna boków bez bigów) wg `docs/PRODUCTION.md` §9.3,
  - linie cięcia: obrys arkusza z **końcami zakładki klejowej ściętymi pod 45°** [K] (bez nacięć klap dna),
  - klej dna: pas OV = 30 mm na końcu rękawa; klapa tylna na wierzchu [K], więc klej na stronie zadrukowanej klapy przedniej.
- **Grafiki:** wgrane grafiki nałożone na swoje ścianki (ten sam tryb `ArtworkPlacement` co w 3D), przełącznik pokaż/ukryj; widać, co wchodzi w dno i zakładkę.
- **Oznaczenia:** linie wymiarowe (W, D, H, zapas na dno, zakładka), spad i strefa bezpieczna, nazwy ścianek, obrys łatek uchwytów na przodzie i tyle.
- **Architektura:** geometria wykroju to czysta funkcja domenowa (`src/domain/dieline`), jedno źródło prawdy dla podglądu, SVG i PDF; widok 2D i eksporty są osobnymi adapterami.

### 4f. Wyrównanie grafiki i rozciągnięcie na dno (wywiad 29.09.2026)

Na wykroju (edycja grafiki), per ścianka:

- **Wyrównanie (align):** do lewej / środka / prawej krawędzi i do góry / środka / dołu ścianki (ustawia `offsetX/offsetY` w `ArtworkPlacement`).
- **Rozciągnięcie na dno:** przełącznik rozszerzający obszar grafiki ścianki o zapas na dno `(D + 30) / 2` poniżej linii dna — obszar ścianki `W × (H + a)` / `D × (H + a)`; grafika wtedy pokrywa klapy / uszy / trójkąty dna i jest widoczna od spodu w 3D. Wyrównanie „do dołu” odnosi się wtedy do dolnej krawędzi zapasu.
- 2D i 3D nadal liczą mapowanie tą samą funkcją; pokrycie farbą uwzględnia rozszerzony obszar.

**Implementacja (29.09.2026):**

- Model: `ArtworkPlacement` ma w obu trybach pole `extendToBottom: boolean`. Domyślna wartość dla nowej grafiki, nowych ścianek i „Resetuj” to stała `ARTWORK_EXTEND_TO_BOTTOM_DEFAULT` (`productionRules.ts`, obecnie `false` — klient może zdecydować `true`); brak pola w starszych danych = `false` (`normalizePlacement`). **Obszar grafiki** ścianki = `getPanelArtworkArea(panel, wymiary, placement)` w mm panel-local: `[0, Pw] × [0, H]` lub, z rozciągnięciem, `[0, Pw] × [−a, H]`. FILL rozciąga obraz na cały obszar (także `H + a`); w CUSTOM `scale` jest względem „contain” w obszarze, a `offsetX/offsetY` względem środka obszaru.
- `computePanelUvTransform(panelSize, imageSize, placement, area?)` — sygnatura zachowana, czwarty argument (obszar) opcjonalny, domyślnie ścianka. UV geometrii pozostaje `(x / Pw, y / H)` widocznej ścianki; zapas na dno kontynuuje tę samą przestrzeń poniżej `v = 0`. Wywołują ją z obszarem: renderer 3D, wykrój 2D (`scene.ts`) i pokrycie farbą.
- Wyrównanie: `alignPlacement(placement, { horizontal?, vertical? }, obszar, obraz)` — 3 × 3 (LEFT/CENTER/RIGHT × TOP/MIDDLE/BOTTOM, osobno lub razem); krawędź prostokąta obrazu (z uwzględnieniem obrotu) dotyka krawędzi obszaru. Z FILL najpierw przejście na CUSTOM „contain”. Na wykroju: dwie grupy po 3 przyciski + przełącznik „Rozciągnij na dno” w pasku edycji.
- Przełączenie rozciągnięcia (`setPlacementExtendToBottom`, akcja store `setPanelExtendToBottom`): grafika CUSTOM **zostaje w tym samym miejscu** na ściance (przeliczone `scale` i przesunięcia), FILL rozciąga się na nowy obszar. „Rozciągnij” (FILL) zachowuje przełącznik, „Resetuj” i usunięcie grafiki go zerują, podmiana grafiki go zachowuje.
- Wykrój 2D: bez rozciągnięcia grafika jest przycinana do ścianki + 2 mm zachodzenia przez linię dna (wcześniej wchodziła w zapas); z rozciągnięciem — do końca rękawa + spad 3 mm. Eksport SVG/PDF korzysta z tej samej sceny. Zaznaczona ścianka pokazuje obrys obszaru grafiki. Zapas na dno jest rysowany per kolumna: bez grafiki — szare tło, z grafiką (rozciągnięta ścianka) — fioletowy przerywany obrys bez przyciemnienia, żeby było widać, jakie kolory trafiają na dno (legenda; to samo w eksporcie SVG/PDF).
- 3D: dno składa się z widocznych od spodu części (model klienta [K]): trapez tyłu (wierzch), odsłonięta część trapezu przodu i dwa trójkąty klap boków między przekątnymi; każda ma UV w przestrzeni swojej ścianki (`getBottomPieces` / `getVisibleBottomPieces` w `blockBottom.ts`) i tę samą teksturę co ścianka, pokazywaną tylko przy `extendToBottom` — kolory widoczne od spodu są dokładnie tymi z arkusza. Narożne trójkąty (uszy) przodu/tyłu są schowane (odwrócone, między klapą boku a trapezem). Które części strefy dna widać od spodu: `getVisibleBottomZoneParts` / `printCoverage/bottomVisibility.ts`.
- Pokrycie farbą: dla ścianek z rozciągnięciem próbkowany jest obszar `Pw × (H + a)` (pole `printArea` w wyniku per ścianka); mianownik bez zmian (arkusz bez spadu). Rozstrzyga pytanie z §8.

### 4e. Eksport konfiguracji: PDF i Excel (wywiad 29.09.2026)

- **PDF — karta produktu** (wszystko):
  1. strona z parametrami (typ, wymiary, papier: rodzaj/kolor/gramatura/FSC/bariera, uchwyt, nadruk + Pantone z pokryciem, pakowanie, zapas na dno, wymiar arkusza),
  2. wykrój z grafikami i wymiarami,
  3. widoki 3D (pełna bryła, po zgięciu ścianek) + **opcje złożonej torby** (złożona na płasko, etapy składania).
- **Excel — kilka arkuszy:** Parametry / Ścianki i grafiki / Pantone i pokrycie / Wykrój (wymiary arkusza, kolumny ścianek, linie cięcia i bigowania).
- Eksport z kroku Podsumowanie; generowany z `BagConfiguration` + funkcji domenowych (`buildDieline`, pokrycie), zrzuty 3D renderowane offscreen z tego samego modelu. Biblioteki ładowane leniwie.
- **Nakład usunięty z konfiguracji** (decyzja klienta) — nie występuje w eksporcie.

### 4g. Import wzornika kolorów `.ase` (prośba klienta 30.09.2026)

„Zrób import wzornika .ase” — użytkownik wczytuje **własną, licencjonowaną** bibliotekę kolorów w formacie Adobe Swatch
Exchange (np. eksport z Pantone Connect), a aplikacja używa jej do przybliżania kolorów Pantone.

- **Licencja:** wartości Pantone są własnością Pantone LLC — aplikacja **nie zawiera i nie dołącza** żadnej biblioteki
  Pantone (poza dotychczasowymi ~19 orientacyjnymi kolorami podglądu w `PANTONE_PREVIEW_SUGGESTIONS`). Plik dostarcza
  użytkownik; zostaje **tylko w jego przeglądarce** (localStorage), nie jest nigdzie wysyłany i **nie trafia** do
  `BagConfiguration`, wyceny, JSON ani eksportów PDF / Excel (tam jest tylko kod + wybrany HEX podglądu, jak dotąd).
- **Parser (domena, `src/domain/swatches/ase.ts`):** big-endian: `ASEF`, wersja 1.x, liczba bloków; bloki `0xC001`
  (początek grupy, nazwa), `0xC002` (koniec grupy), `0x0001` (kolor: nazwa UTF-16BE z długością wliczającą terminator,
  model `RGB ` / `CMYK` / `LAB ` / `Gray`, wartości float32, typ global / spot / normal); nieznane bloki pomijane
  po długości. Konwersja do CIELAB (D65 — ta sama przestrzeń co piksele grafik): **LAB** — L zapisane 0..1 (× 100),
  a / b bez zmian, **względem D50** (konwencja Adobe / Pantone) → adaptacja Bradforda do D65; **RGB** 0..1 → sRGB → Lab;
  **CMYK** — naiwne `255·(1−C)·(1−K)` bez profilu ICC, oznaczone jako przybliżone (≈); **Gray** 0..1 (0 = czerń) → szarość.
  Każdy wpis: nazwa (np. „PANTONE 186 C”), grupa, model źródłowy, typ, Lab, HEX podglądu.
- **Odporność:** błędy typowane (`EMPTY_FILE`, `TOO_LARGE`, `NOT_ASE`, `UNSUPPORTED_VERSION`, `TRUNCATED`,
  `NO_COLORS`); limit rozmiaru pliku i liczby kolorów w `SWATCH_LIBRARY_RULES` (5 MB, 20 000). Wpisy nieużyteczne są
  pomijane i liczone: nieobsługiwany model (np. HKS), błędne wartości, bez nazwy, **duplikat kodu** (ten sam
  `pantoneLookupKey`, wygrywa pierwszy), ponad limit. Nieudany import nie zmienia wczytanych wzorników.
  Naiwne przeliczenie CMYK i odczyt Gray jako jasności — **zaakceptowane przez klienta [K] 30.09.2026** (bez profilu ICC).
- **Dopasowanie (`src/domain/swatches/matching.ts`):** wyszukiwanie po kodzie znormalizowanym jak `pantoneLookupKey`
  („PANTONE 186 C” = „PMS 186 C” = „186 C”); najbliższe kolory wzornika do koloru wg **CIEDE2000** (top N).
- **Kilka wzorników naraz** (decyzja klienta [K] 30.09.2026, np. Coated + Uncoated; `src/domain/swatches/libraries.ts`):
  import **dodaje** wzornik; plik o tej samej nazwie (bez rozróżniania wielkości liter) **zastępuje** wczytany wcześniej
  na tym samym miejscu listy. Limity w katalogu: `maxLibraries` (8) i `maxTotalColors` (50 000 kolorów łącznie) —
  import ponad limit jest odrzucany (`TOO_MANY_LIBRARIES` / `TOO_MANY_COLORS`, wczytane wzorniki bez zmian; wymieniany
  wzornik nie liczy się do limitu). Wyszukiwanie po kodzie i najbliższe kolory działają na **wspólnej puli** wszystkich
  wzorników (`poolSwatches`): każdy kolor ma nazwę swojego wzornika; kod obecny w kilku wzornikach występuje raz —
  z wczytanego najwcześniej (jak duplikat w jednym pliku).
- **Stan:** osobny store `swatchLibraryStore` (poza konfiguracją): lista wzorników, pula kolorów, indeks kodów, akcje
  dodaj / usuń jeden / usuń wszystkie. Zapis w localStorage (`paper-bag-configurator.swatchLibrary`, format v2:
  `{ v: 2, libraries: [...] }`) w try/catch; limit `maxStoredChars` dotyczy **wszystkich wzorników razem** — zapisywane
  są po kolei, dopóki się mieszczą, a te, które się nie mieszczą (albo gdy pamięć jest niedostępna), działają do
  zamknięcia karty (UI oznacza je przy każdym wzorniku). Zapisany wcześniej pojedynczy wzornik (format v1) jest
  wczytywany jako lista z jednym elementem (migracja przy odczycie; przy następnej zmianie zapis w v2). Aplikacja działa
  bez wzornika.
- **UI — „Nadruk i produkcja”:** „Importuj wzornik (.ase)” (wybór jednego lub kilku plików), lista wczytanych
  wzorników — każdy z nazwą, plikiem, liczbą kolorów, pominiętymi wpisami, przybliżonymi CMYK, informacją „tylko do
  zamknięcia karty” i własnym przyciskiem „Usuń”; błędy z nazwą pliku; notka o kilku wzornikach i o licencji /
  prywatności. Przy dodawaniu kodu, który jest we wzorniku, **kolor podglądu pochodzi ze wzornika** (przed wbudowanymi
  podpowiedziami; podpowiedź „We wzorniku „…”: …” pod polem); przy kolorze na liście znacznik „z wzornika” (nazwa
  wzornika w podpowiedzi), a gdy podgląd zmieniono — przycisk „kolor z wzornika”.
- **UI — „Kolory w grafikach (HEX)”:** z wczytanym wzornikiem dodatkowa kolumna „Wzornik (najbliższy)”: dla każdego
  wykrytego koloru `SWATCH_LIBRARY_RULES.suggestionsPerColor` (2) najbliższe kolory wszystkich wzorników (z nazwą
  wzornika) z ΔE00 i przyciskiem
  „Dodaj” (do kolorów nadruku: kod = nazwa ze wzornika, HEX = kolor wzornika; obowiązują limit kolorów, długość kodu
  i brak duplikatów — kod już obecny, także z innym prefiksem, pokazany jako „na liście”). Bez wzornika — bez zmian.
- **Duplikaty kodów nadruku** (zmiana przy okazji): `validatePantoneColorToAdd` porównuje kody przez `pantoneLookupKey`,
  więc „PANTONE 186 C” jest duplikatem „PMS 186 C”; duplikat jest zgłaszany przed limitem kolorów.

### 4h. Plik projektu — zapis i wczytanie (prośba klienta 30.09.2026)

„Chciałbym mieć opcję wczytania projektu i eksportu” — cały projekt (konfiguracja + pliki grafik) zapisywany do
jednego pliku i wczytywany później, z dokładnym odtworzeniem konfiguratora. Wzorniki `.ase` (§4g) **nie** są częścią
projektu (zostają w przeglądarce). **Stan widoku** (krok kreatora, tryb podglądu, suwak składania, zaznaczona
grafika / warstwa) **jest** zapisywany w pliku (decyzja klienta [K] 30.09.2026) — osobno od konfiguracji produktu.

- **Format `.bagproj`** (`src/domain/project/projectFile.ts`) = archiwum **ZIP**:
  - `project.json` — manifest: `format: "paper-bag-configurator/project"`, `formatVersion` (liczba całkowita,
    obecnie **1**), `generator: { name, version }` (wersja aplikacji z `package.json`), `exportedAt` (ISO 8601),
    `configuration` — **cały `BagConfiguration` bez zmian** (także pola nieznane tej wersji), z jednym wyjątkiem:
    `fileUrl` każdej grafiki to ścieżka jej pliku w archiwum (URL-e `blob:` nie są przenośne), oraz `files` —
    `[{ artworkId, path, fileName, mimeType, width, height, sizeBytes }]`, oraz opcjonalnie `view` —
    `{ step, previewMode, timelineProgress, selectedArtwork }` (stan widoku; dodane w ramach v1, brak sekcji / pola
    = widok domyślny, więc starsze pliki v1 wczytują się bez zmian);
  - `artwork/<n>.<png|jpg|webp>` — oryginalne pliki grafik (bez rekompresji, w ZIP „stored”), **każdy raz na id
    grafiki** (ta sama grafika na kilku ściankach / w warstwie = jeden plik). Zapisywane są grafiki obu układów
    (per ścianka i całej torby), jak w JSON.
  - Grafiki są znajdowane w konfiguracji **po kształcie** (obiekt z `id`, `fileName`, `fileUrl`, `mimeType`, `width`,
    `height`), więc nowe miejsca na grafiki przechodzą przez zapis bez zmian w formacie.
- **Dlaczego ZIP, a nie JSON z base64:** obrazy do 20 MB każdy (do 12 slotów) — base64 dokłada 33 % i wymaga
  trzymania całości jako jednego napisu; ZIP przechowuje bajty bez zmian, a rozmiary wpisów można sprawdzić przed
  rozpakowaniem (ochrona przed „zip bomb”). Biblioteka **fflate** (mała, bez zależności) była już w projekcie jako
  zależność jsPDF — teraz jest zależnością bezpośrednią.
- **Limity** (`PROJECT_FILE_RULES` w katalogu): plik ≤ 256 MB, suma rozpakowanych wpisów ≤ 256 MB, manifest ≤ 5 MB,
  ≤ 32 pliki grafik, każda grafika ≤ `ARTWORK_RULES.maxSizeBytes`.
- **Wczytanie** (`parseProject` → `sanitizeConfiguration`): błędy typowane `ProjectFileError`: `EMPTY_FILE`,
  `TOO_LARGE`, `TOO_MANY_FILES`, `NOT_A_PROJECT` (inny plik / inny `format`), `NEWER_VERSION` (plik z nowszej wersji
  aplikacji — odrzucony z numerem wersji), `MISSING_FILE` (grafika bez pliku, z nazwą pliku), `CORRUPT_DATA`
  (uszkodzone archiwum / JSON / plik nie jest obrazem PNG/JPEG/WEBP — typ sprawdzany po bajtach, zapisany typ MIME
  poprawiany wg danych), `UNSUPPORTED_PRODUCT_TYPE` (typ torby niedostępny w tej wersji). Nieudane wczytanie nie
  zmienia bieżącego projektu.
- **Sanityzacja** (`src/domain/project/sanitizeConfiguration.ts`): te same fabryki i ograniczenia co akcje store —
  wymiary przycinane (krok 5 mm, gł. ≤ szer.), papier dopasowany do wariantu uchwytu, nieznane opcje → domyślne,
  placementy normalizowane, grafiki nie do użycia usuwane, warstwy ≤ `MAX_WRAP_ARTWORK_LAYERS`, kolory Pantone
  (duplikaty, limit, HEX) i `colorAnalysis` jak w store. Każda zmiana to „dopasowanie” (sekcja + pole) pokazane
  użytkownikowi. **Nieznane pola są zachowywane** (np. `glueFlapWidth` z innej gałęzi) — nie są jednak walidowane,
  dopóki ich właściciel nie doda reguły do sanityzacji.
- **Migracje:** `formatVersion` starszy niż bieżący → łańcuch `MANIFEST_MIGRATIONS` (na razie pusty — v1 to pierwsza
  wersja); starsze kształty samej konfiguracji rozpoznawane niezależnie od wersji: pojedyncze `wrapArtwork` → jedna
  warstwa (`withWrapLayers` / id `wrap-<id grafiki>`), brak `artworkLayout` → `PER_PANEL`, brak `colorAnalysis` /
  `extendToBottom` → domyślne. Przyjmowany jest też **starszy plik JSON** z Podsumowania
  (`bag-configuration-<id>.json`): konfiguracja jest wczytywana, ale grafiki (tylko URL-e `blob:`) są pomijane
  z ostrzeżeniem.
- **Stan** (`src/state/projectFile.ts`): `exportProject` czyta bajty grafik z bieżących URL-i (`fetch` obiektowego
  URL-a lub zasobu demo), raz na id; `readProjectFile` (bez skutków ubocznych) + `applyProject` = `loadProject`:
  nowe URL-e obiektowe dla grafik, `replaceConfiguration` (zwalnia URL-e poprzedniego projektu), odtworzenie stanu
  widoku (`applyProjectView`), projekt oznaczony jako zapisany. „Niezapisane zmiany” = konfiguracja różna od ostatnio
  zapisanej / wczytanej (na starcie: od domyślnej); zmiany samego widoku się nie liczą.
- **Stan widoku** (`src/domain/project/viewState.ts`, `sanitizeProjectView`; listy kroków / trybów przekazuje warstwa
  stanu): eksport zapisuje bieżący krok (`configuratorUiStore.step`), tryb podglądu (`previewStore.viewMode`, `null`
  = własna pozycja suwaka 3D), pozycję osi czasu 0–1 (`progress`) i zaznaczoną grafikę (`selectedArtwork`: ścianka
  lub `WRAP:<id warstwy>` — id warstw są zachowywane). Przy wczytaniu: nieznany krok / tryb → domyślny (krok 1,
  „3D pełne”), oś czasu przycinana do 0–1, tryb 3D ustawia swój preset (jak przycisk trybu), `null` + pozycja trafiająca
  dokładnie w preset wybiera ten preset (jak suwak), zaznaczenie zostaje tylko, jeśli wskazuje grafikę aktywnego układu
  wczytanej konfiguracji (inaczej brak zaznaczenia). Odtwarzanie zawsze zatrzymane. **Nie** są zapisywane: kamera 3D
  (orbita / zoom — stan wewnętrzny kontrolek renderera), powiększenie i warstwy widoczności wykroju 2D, język.
- **UI:** w nagłówku obok „Demo” — „Zapisz projekt” i „Wczytaj projekt” (dostępne z każdego kroku; pliki
  `.bagproj`, `.zip`, `.json`). Przy niezapisanych zmianach wczytanie pyta o potwierdzenie w dialogu na stronie
  (`ConfirmDialog`, `role="alertdialog"`, fokus na „Anuluj”, Esc anuluje). Komunikat o wyniku pod przyciskami:
  zapisano (nazwa pliku) / wczytano (nazwa, data zapisu, ostrzeżenia, dopasowane sekcje) / błąd. W Podsumowaniu
  „Pobierz JSON” zastąpione przez „Zapisz projekt (.bagproj)”; „Kopiuj JSON” i podgląd JSON zostają.
- **Nazwa pliku:** `<prefiks>-<typ>-<W>x<H>x<D>-<RRRR-MM-DD>.bagproj`, prefiks wg języka (`projekt-torby`,
  `bag-project`, `taschen-projekt`), np. `projekt-torby-block-200x400x150-2026-09-30.bagproj`.

## 5. Architektura

```text
USER → UI (src/ui) → store (src/state, Zustand) → BagConfiguration (src/domain)
                                                   ├→ Renderer 3D (src/renderer)
                                                   └→ Pricing Engine (src/pricing, przyszłość)
```

- `src/domain` — czyste TS, bez Reacta i Three.js. Typy, katalog produktów, fabryki, walidacja.
- `src/state` — jedyne źródło prawdy (Zustand). Akcje zmieniają wyłącznie konfigurację domenową.
- `src/ui` — komponenty formularzy; wszystkie teksty przez `react-i18next` (PL + EN).
- `src/renderer` — Three.js / R3F; zależy tylko od typów domenowych.
- `src/pricing` — tylko kontrakt `PricingEngine`.

Konfigurator jest podzielony na **kroki** (swobodna nawigacja między nimi, podgląd 3D zawsze widoczny):
1. Typ i wymiary → 2. Papier i uchwyt → 3. Grafiki → 4. Nadruk i produkcja → 5. Podsumowanie (JSON, zapis projektu).
Zapis / wczytanie projektu (`.bagproj`, §4h) dostępne z nagłówka w każdym kroku.

Docelowe drzewo komponentów:

```text
App
├── ProductTypeSelector
├── BagConfigurator
│   ├── DimensionsForm
│   ├── PaperConfigurator
│   ├── HandleConfigurator
│   ├── ArtworkConfigurator → układ grafik + PanelArtworkUploader × 4 (lub WrapLayerList dla całej torby)
│   └── ProductionOptions (nadruk z kolorami podglądu Pantone, import wzornika .ase, pakowanie)
└── BagPreview3D
    ├── BagModel → BagPanel × N
    ├── HandleModel
    └── CameraControls
```

## 6. Kryteria akceptacji MVP

1. Otworzenie konfiguratora.
2. Wybór „Torba klockowa”.
3–5. Wprowadzenie szerokości, wysokości, głębokości (z walidacją zakresów).
6. Zmiana geometrii torby w 3D.
7. Włączenie/wyłączenie uchwytu (+ wybór typu).
8. Uchwyt widoczny na modelu 3D.
9–12. Dodanie grafiki na przednią, tylną, lewą, prawą ściankę.
13. Każda grafika na właściwej powierzchni modelu.
14. Obracanie modelu.
15. Przybliżanie i oddalanie.
16. Zmiana parametrów bez przeładowania strony.
17. Usunięcie lub podmiana grafiki.
18. Poprawna konfiguracja jako obiekt danych (podgląd/eksport JSON).
19. Przełączanie języka PL/EN.
20. Wybór koloru papieru widoczny w 3D.
21. Suwak złożenia 0–100% z animacją; boki składają się na bigach, grafika łamie się z papierem.

## 7. Poza MVP

Wycena, zamówienia, płatności, konta, workflow akceptacji, zaawansowany preflight, formaty DTP, pliki
produkcyjne, eksport do maszyn, pełny system materiałów, magazyn, ERP/MES, moduł pozycjonowania grafiki.

## 8. Otwarte pytania

- **Limity szerokości / wysokości — konflikt źródeł:** strona główna [0] podaje szerokość 75–260 mm i wysokość
  170–430 mm, a tabela toreb z uchwytem płaskim [2] zawiera rozmiary do 450×170×470 (szerokość 280–450, wysokość 470).
  Które limity obowiązują (ogólne czy zależne od wariantu uchwytu)? Na razie zostają 75–260 / 170–430; rozmiary
  standardowe poza nimi (bez uchwytu: 320×220×400; płaski: 280×170×280, 320×110×400, 350×170×400, 450×170×470)
  są pokazane jako niedostępne.
- Rozmiary standardowe bez uchwytu: znane są tylko krańce klas (S/M/L/XL) — czy są rozmiary pośrednie?
- Czy kolor papieru (biały / brązowy) jest dostępny dla każdego rodzaju papieru (np. kredowany, tłuszczoszczelny)?
- Czy bariera na wilgoć i FSC® łączą się z każdym rodzajem papieru?
- Zakres głębokości (brak na stronie referencyjnej).
- Czy 200/400/150 to na pewno wartości domyślne (a nie np. inne zakresy)?
- Czy nadruk / pakowanie mają być edytowalne w UI MVP, czy tylko obecne w modelu danych?
- Gramatury: czy dostępne są wszystkie wartości co 10 g/m² w zakresach wariantów (50–120 / 70–110 / 70–120; przyjęte w katalogu jako `grammage.step`), czy tylko wybrane?
- Kody Pantone: czy walidować format (np. „PMS 186 C”) lub wybierać z listy? Obecnie dowolny tekst (maks. 32 znaki, bez duplikatów — porównanie bez prefiksu PMS / PANTONE); z wczytanym wzornikiem `.ase` (§4g) kolor podglądu i podpowiedzi pochodzą z wzornika.
- „Rozciągnij na dno” na bokach (LEFT/RIGHT): uszy i trójkąty są w gotowym dnie przykryte klapami, więc ten nadruk nie jest widoczny (a liczy się do pokrycia farbą). Czy blokować / ostrzegać przy bokach?
- Pokrycie farbą: ~~czy grafika w zapasie na dno ma być wliczana?~~ — rozstrzygnięte w §4f (liczona przy „Rozciągnij na dno”). Czy biały podkład pod kolorami na papierze brązowym liczyć osobno? Czy progi (ΔE bieli 8, alfa 8/255) są akceptowalne?
- ~~Wykrój: rozmiar łatki uchwytu i rozstaw końców~~ — rozstrzygnięte [K] (29.09.2026): łatka 100 × 20 mm, 20 mm pod
  górną krawędzią (`y ∈ [H − 40, H − 20]`), rozstaw końców zawsze 80 mm, taśma płaska 20 mm (`docs/PRODUCTION.md` §5, §9.5).
- Grafika cykliczna (§3a): obraz szerszy niż obwód torby (`2W + 2D`) jest przycinany do jednego obwodu wokół swojego
  środka (żeby nie nachodził sam na siebie). Czy tak, czy np. blokować skalę powyżej obwodu?
- Wykrój PDF: standardowe fonty jsPDF nie mają polskich znaków spoza WinAnsi — teksty w PDF są transliterowane
  (ł → l). Osadzić font Unicode?
- Obrót grafiki tylko co 90° (dowolny kąt wymagałby własnego shadera UV w 3D). Wystarczy?
- ~~Grafika na całą torbę (§3a): gdzie zaczyna się grafika (szew / kolejność arkusza czy przód)?~~ — rozstrzygnięte
  [K] (30.09.2026): **od lewej krawędzi przodu**, dookoła torby FRONT | RIGHT | BACK | LEFT; na wykroju kolumna LEFT
  pokazuje koniec grafiki (§3a).
- ~~Grafika na całą torbę: czy zakładka klejowa może być zadrukowana?~~ — rozstrzygnięte [K] (30.09.2026): **nie**,
  zakładka idzie pod spód i zostaje bez nadruku (dla wszystkich warstw; 2 mm zachodzenia jak przy ściankach).
- Warstwy grafiki (§3b) — przyjęte założenia do potwierdzenia: (1) limit 8 warstw; (2) nowa warstwa po pierwszej
  startuje dopasowana (contain) do przodu i wyśrodkowana na nim — czy logo ma startować mniejsze (np. 50 % przodu) albo
  w innym miejscu?; (3) podmiana pliku warstwy zachowuje jej położenie (przy ściance podmiana wraca do FILL) — czy tak
  ma zostać?; (4) pokrycie farbą liczone z kompozytu (warstwa kryjąca zastępuje farbę pod spodem) — w druku
  fleksograficznym farby mogą się jednak nakładać (overprint / podkład) — czy liczyć farbę warstw osobno?; (5) na
  wykroju kliknięcie w zaznaczoną warstwę przykrytą inną nadal przesuwa zaznaczoną — czy to czytelne dla użytkownika?
- Warstwy w 3D: kompozyt ścianki ma maks. 2048 px dłuższego boku (~4 px/mm przy typowej ściance z zapasem na dno) —
  wystarczy do podglądu? Drobny tekst / kod kreskowy może wyglądać miękko (wykrój i eksport mają pełną rozdzielczość).
- Przełączanie układu grafik: czy grafiki nieaktywnego układu mają być zachowywane (obecnie tak, także w JSON), czy
  usuwane po przełączeniu?
- Eksport JSON: `artwork.fileUrl` to lokalny `blob:` URL (ważny tylko w tej karcie) — do zastąpienia URL-em z backendu.
  Przenośny zapis projektu z grafikami: plik `.bagproj` (§4h).
- Plik projektu (§4h) — rozstrzygnięte [K] (30.09.2026): ~~rozszerzenie `.bagproj` i nazwa pliku~~ — **tak, bez
  zmian**; ~~czy zapisywać stan widoku~~ — **tak**: krok, tryb podglądu, suwak składania i zaznaczona grafika / warstwa
  (opcjonalna sekcja `view`, brak = widok domyślny; bez orbity kamery); ~~wczytanie Demo jako niezapisana zmiana~~ —
  **tak, zostaje**; ~~limit 256 MB na plik~~ — **wystarcza**.
- Plik projektu (§4h) — nadal otwarte: (1) czy zapisywać też grafiki nieaktywnego układu (obecnie tak — plik może być
  większy niż potrzeba); (2) czy plik ma zawierać też wzorniki `.ase` (obecnie nie — licencja Pantone, §4g);
  (3) projekt z typem torby niedostępnym w danej wersji (np. fałdowa przed wdrożeniem) jest odrzucany — czy wczytywać
  go jako klockową?; (4) wspólne przechowywanie projektów (serwer / konto) poza MVP.
- Wzornik `.ase` (§4g): czy wzornik ma być współdzielony w firmie (serwer, licencja firmowa Pantone), czy zostaje
  lokalny w przeglądarce użytkownika (obecnie lokalny)? ~~Czy trzymać kilka wzorników naraz?~~ — rozstrzygnięte [K]
  (30.09.2026): **tak**, kilka wzorników naraz (np. Coated + Uncoated), §4g.
- Wzornik `.ase`: kolumna „Pantone (najbliższy)” w tabeli kolorów grafik nadal porównuje z listą nadruku (ΔE76), a
  kolumna wzornika z biblioteką (ΔE00) — czy ujednolicić na ΔE00? Czy przyciemniać / ukrywać podpowiedzi wzornika
  powyżej jakiegoś ΔE (obecnie zawsze 2 najbliższe)? — [K] 30.09.2026: na razie zostaje bez zmian.
- ~~Wzornik `.ase`: kolory CMYK przeliczane naiwnie (bez profilu ICC), a Gray jako jasność — wystarczy?~~ —
  rozstrzygnięte [K] (30.09.2026): **wystarczy**, profil ICC niepotrzebny.
- ~~Dno przy `W < 2E` (klapy boków zachodzą na siebie): czy wewnętrzna jest klapa LEFT?~~ — rozstrzygnięte [K]
  (30.09.2026): **tak**, klapa LEFT leży do środka (`docs/PRODUCTION.md` §3.4.2).

**Torba fałdowa (`FOLDED`, §2a, `docs/PRODUCTION.md` §13):** wytyczne klienta 30.09.2026 [K] rozstrzygnęły:
~~zakres fałdy~~ (`F ≤ W`, zalecane 0,4–0,7·W), ~~dno~~ (pasek `d` 15–30 / 25 mm z klejem, na tył, pojedyncze lub
podwójne), ~~szew~~ (`s` 10–20 / 15 mm; położenie: decyzja 30.09.2026 — na krawędzi tył | fałda lewa, układ wykroju jak w torbie
klockowej; środek tylnej ścianki nie jest używany), ~~pole nadruku~~ (`W × (H − d)` na stronę), ~~papiery~~
(kraft, MG, tłuszczoszczelny, PE), ~~minimalny nakład~~ (30 000 — tylko informacja). Pozostaje:

- Dno podwójne: wytyczne dopuszczają dwa zagięcia — ma być opcją w konfiguratorze (obecnie tylko pojedyncze)? Jak
  zmienia się `L` (`H + 2d`?)
- Wylot ząbkowany / wycięcie na kciuk: opcja w konfiguratorze (obecnie tylko cięcie proste)? Wymiary wycięcia?
- Zakres regulacji `d` (15–30): czy użytkownik ma go wybierać, czy zostaje stały produkcyjny (25)? (`s` 10–20 jest już
  ustawiane w konfiguratorze.)
- Minimum fałdy: przyjęto 20 mm. Torba płaska (`F = 0`) ma być osobnym typem / wariantem?
- Nadruk na pasku dna `d` i klej tylko na pasku czy też wewnątrz końca rękawa?
- Gramatury: lista w zakresie 30–60 (przyjęto co 5, domyślnie 40)?
- „Standardowe wymiary 180×180, 200×200, 260×260, 280×280”: do czego należą? Obecnie brak rozmiarów standardowych.
- Okno (folia PP / celulozowa, panoramiczne / prostokątne), rożek, pakowanie w wiązki 100 / 250 / 500 i paleta: kiedy
  mają wejść do konfiguratora?
- Czy torba fałdowa ma mieć w podglądzie składanie z arkusza według kolejności z wytycznych (rękaw + fałdy, szew,
  cięcie, dno)?
