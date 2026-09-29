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
| Typ torby | `BLOCK` (klockowa). `FOLDED` (fałdowa) widoczna w UI jako „wkrótce” | wytyczne |
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

## 4. Podgląd 3D

- React Three Fiber + drei; model generowany proceduralnie z `width/height/depth` (bez statycznych modeli).
- Obrót, zoom, pan, oglądanie wszystkich stron; neutralne tło; oświetlenie pokazujące kształt i grafikę.
- Natychmiastowa reakcja na zmianę wymiarów, uchwytu, koloru papieru i grafik.
- Kolor papieru (biały / brązowy) = bazowy kolor materiału ścianek bez grafiki.
- Uchwyty: skręcany = rura po krzywej (`TubeGeometry`), płaski = płaska taśma; obie z łatką od wewnątrz.
- Renderer jest wyłącznie widokiem: czyta `BagConfiguration`, nie przechowuje własnego źródła prawdy.
- Obiektowe URL-e i tekstury muszą być zwalniane (`URL.revokeObjectURL`, `texture.dispose()`).

### 4a. Podgląd złożenia (wywiad, 29.09.2026)

Suwak **„Złożenie” 0–100%** pokazuje przejście od torby rozłożonej (0%) do złożonej na płasko (100%).

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

### 4c. Tryby podglądu (wywiad 29.09.2026)

Przełącznik trybów w panelu podglądu:

1. **Wykrój 2D** — płaski arkusz z grafikami (podgląd + edycja: przesuwanie/skalowanie grafiki na ściance).
2. **3D pełne** — prostopadłościan (foldProgress = 0).
3. **3D po zgięciu ścianek** — „naturalnie stojąca” torba: boki cofnięte na bigach względem krawędzi przodu/tyłu, dolny trójkąt ok. 45° do osi Z (preset kinematyki). Zdefiniowane jako `p`, przy którym dolny trójkąt boku (od środka podstawy do wierzchołka) jest odchylony o 45° od pionu; wyznaczone bisekcją ≈ 0,2497 niezależnie od wymiarów, zaokrąglone do **0,25** (krok suwaka 1%). Uwaga: w tym stanie model jednoparametrowy unosi tylną krawędź dna o φ ≈ 8,4° (ok. 22 mm przy D = 150).
4. **3D złożona na płasko** — foldProgress = 1.

Przełączenie trybu 3D animuje przejście. **Suwak złożenia zostaje jako dodatek** (tylko w trybach 3D): płynny podgląd całego składania; jego przesunięcie odznacza tryb, chyba że wartość trafi dokładnie w preset. Grafiki w 3D widoczne na ściankach i łamią się na bigach. Grafiki dodawane na razie **per ścianka**.

### 4d. Pokrycie farbą (wywiad 29.09.2026)

W kroku **Grafiki**, aktualizowane na żywo:

- **Pokrycie farbą łącznie** — procent powierzchni **arkusza (wykroju)** faktycznie pokrytej farbą, liczony z pikseli grafik po pozycjonowaniu (`ArtworkPlacement`), przyciętych do ścianek.
- **Pokrycie per kolor Pantone** — rozbicie na kolory z listy nadruku (krok 4); każdy piksel z farbą przypisany do najbliższego koloru z listy (każdy kolor Pantone ma przypisany podgląd RGB/HEX wybierany przez użytkownika).
- „Brak farby”: piksele przezroczyste; na papierze **białym** także piksele bliskie bieli; na papierze **brązowym** biel jest farbą (biały nadruk).
- Wynik to przybliżenie do wyceny (zużycie farby), nie separacja produkcyjna. Liczenie jako czysta funkcja domenowa na tablicach pikseli (testowalna), próbkowanie na zmniejszonych obrazach.

**Model i algorytm (implementacja 29.09.2026):**

- `PrintSpec.pantoneColors: { code, hex }[]` — kod Pantone + kolor podglądu `#rrggbb` (wybierany w kroku 4 próbnikiem koloru). Przy dodaniu kodu podpowiadany jest kolor: przybliżenie dla popularnych kodów (`PANTONE_PREVIEW_SUGGESTIONS` w katalogu), inaczej pierwszy nieużyty kolor z palety zastępczej. Pantone → RGB jest przybliżone.
- `computeInkCoverage` (`src/domain/printCoverage`): każda widoczna ścianka (prostokąt ścianki kolumny wykroju z `buildDieline`) jest próbkowana siatką w mm (256 komórek na dłuższym boku ścianki); środek komórki → współrzędne tekstury przez `computePanelUvTransform` (to samo mapowanie co 3D i wykrój 2D) → piksel próbki. Poza obrazem = goły papier.
- **Nie liczą się:** spad, zapas na dno (klapy dna), zakładka klejowa — grafika wchodząca w zapas na dno na wykroju 2D nie jest wliczana (zgodnie z „przycięte do ścianek”). Mianownik = powierzchnia arkusza bez spadu (z zakładką i zapasem na dno).
- Klasyfikacja piksela: alfa < 8/255 → brak farby, powyżej — farba ważona alfą; „bliski bieli” = ΔE76 do bieli ≤ 8 (tylko na papierze białym); przypisanie do najbliższego podglądu Pantone w CIELAB (ΔE76). Pusta lista Pantone → tylko wynik łączny („bez przypisanego koloru”) + podpowiedź. Jeśli > 10 % farby ma ΔE > 30 do najbliższego podglądu — podpowiedź „kolory odległe od listy” (farba nadal liczona do najbliższego koloru). Progi w `PRINT_COVERAGE_RULES`.
- UI: próbka każdej grafiki dekodowana raz na `fileUrl` (maks. 256 px na dłuższym boku, `createImageBitmap` z przeskalowaniem, cache), przeliczenie z opóźnieniem 200 ms w `requestIdleCallback`.
- Ograniczenia: fotografie / przejścia tonalne są przypisywane „na najbliższy kolor” (bez rastra i nakładania farb), więc suma per kolor = pokrycie łączne i nie przekracza 100 %; biała farba pod innymi kolorami na brązowym papierze (podkład) nie jest liczona osobno.

### 4b. Wykrój (dieline) — wywiad 29.09.2026

Płaski rozkład arkusza jednej torby generowany z konfiguracji.

- **Wyjścia:** podgląd 2D w UI (obok / zamiennie z 3D), eksport **SVG** (warstwy: cięcie, bigowanie, grafika, oznaczenia), eksport **PDF** (skala 1:1, mm).
- **Geometria:**
  - ścianki w rzędzie rękawa w kolejności **LEFT | FRONT | RIGHT | BACK | zakładka klejowa wzdłużna** (BACK w jednym kawałku); **szew na krawędzi rękawa między BACK a LEFT**, **zakładka 10 mm** doczepiona do zewnętrznej krawędzi BACK i klejona do wolnej krawędzi LEFT — decyzja klienta (29.09.2026), stała w `productionRules.ts`; szczegóły w `docs/PRODUCTION.md` §9 (np. 200 × 400 × 150 → arkusz 710 × 490 mm),
  - wysokość arkusza = `H + (D + 30) / 2` (zapas na dno pod każdą ścianką),
  - linie bigowania: krawędzie ścianek, linia dna, bigi fałd bocznych (środek + 45°), bigi klap dna wg `docs/PRODUCTION.md`,
  - linie cięcia: obrys arkusza (+ ewentualne nacięcia klap dna).
- **Grafiki:** wgrane grafiki nałożone na swoje ścianki (ten sam tryb `ArtworkPlacement` co w 3D), przełącznik pokaż/ukryj; widać, co wchodzi w dno i zakładkę.
- **Oznaczenia:** linie wymiarowe (W, D, H, zapas na dno, zakładka), spad i strefa bezpieczna, nazwy ścianek, obrys łatek uchwytów na przodzie i tyle.
- **Architektura:** geometria wykroju to czysta funkcja domenowa (`src/domain/dieline`), jedno źródło prawdy dla podglądu, SVG i PDF; widok 2D i eksporty są osobnymi adapterami.

### 4f. Wyrównanie grafiki i rozciągnięcie na dno (wywiad 29.09.2026)

Na wykroju (edycja grafiki), per ścianka:

- **Wyrównanie (align):** do lewej / środka / prawej krawędzi i do góry / środka / dołu ścianki (ustawia `offsetX/offsetY` w `ArtworkPlacement`).
- **Rozciągnięcie na dno:** przełącznik rozszerzający obszar grafiki ścianki o zapas na dno `(D + 30) / 2` poniżej linii dna — obszar ścianki `W × (H + a)` / `D × (H + a)`; grafika wtedy pokrywa klapy / uszy / trójkąty dna i jest widoczna od spodu w 3D. Wyrównanie „do dołu” odnosi się wtedy do dolnej krawędzi zapasu.
- 2D i 3D nadal liczą mapowanie tą samą funkcją; pokrycie farbą uwzględnia rozszerzony obszar.

### 4e. Eksport konfiguracji: PDF i Excel (wywiad 29.09.2026)

- **PDF — karta produktu** (wszystko):
  1. strona z parametrami (typ, wymiary, papier: rodzaj/kolor/gramatura/FSC/bariera, uchwyt, nadruk + Pantone z pokryciem, pakowanie, zapas na dno, wymiar arkusza),
  2. wykrój z grafikami i wymiarami,
  3. widoki 3D (pełna bryła, po zgięciu ścianek) + **opcje złożonej torby** (złożona na płasko, etapy składania).
- **Excel — kilka arkuszy:** Parametry / Ścianki i grafiki / Pantone i pokrycie / Wykrój (wymiary arkusza, kolumny ścianek, linie cięcia i bigowania).
- Eksport z kroku Podsumowanie; generowany z `BagConfiguration` + funkcji domenowych (`buildDieline`, pokrycie), zrzuty 3D renderowane offscreen z tego samego modelu. Biblioteki ładowane leniwie.
- **Nakład usunięty z konfiguracji** (decyzja klienta) — nie występuje w eksporcie.

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
1. Typ i wymiary → 2. Papier i uchwyt → 3. Grafiki → 4. Nadruk i produkcja → 5. Podsumowanie (JSON).

Docelowe drzewo komponentów:

```text
App
├── ProductTypeSelector
├── BagConfigurator
│   ├── DimensionsForm
│   ├── PaperConfigurator
│   ├── HandleConfigurator
│   ├── ArtworkConfigurator → PanelArtworkUploader × 4
│   └── ProductionOptions (nadruk z kolorami podglądu Pantone, pakowanie)
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
- Kody Pantone: czy walidować format (np. „PMS 186 C”) lub wybierać z listy? Obecnie dowolny tekst (maks. 32 znaki, bez duplikatów).
- Pokrycie farbą: czy grafika wchodząca w zapas na dno (widoczna na wykroju) ma być wliczana? Czy biały podkład pod kolorami na papierze brązowym liczyć osobno? Czy progi (ΔE bieli 8, alfa 8/255) są akceptowalne?
- Wykrój: rozmiar łatki uchwytu — encja `Handle.patch` z katalogu (80 × 50 mm) vs `docs/PRODUCTION.md` §9.5
  (`Lp = min(170, W − 20)`, `Hp = 45`). Wykrój używa `Handle.patch`, a wzór z §9.5 tylko, gdy łatki brak.
  Model 3D robi tak samo (`src/domain/geometry/handles.ts`). Końce uchwytu muszą leżeć pod łatką, więc łatka 80 mm
  zawęża rozstaw końców: skręcany 65 mm (zamiast `clamp(W/2, 75, 150)`), płaski 34 mm (zamiast ok. 80–110 mm).
- Wykrój PDF: standardowe fonty jsPDF nie mają polskich znaków spoza WinAnsi — teksty w PDF są transliterowane
  (ł → l). Osadzić font Unicode?
- Obrót grafiki tylko co 90° (dowolny kąt wymagałby własnego shadera UV w 3D). Wystarczy?
- Eksport JSON: `artwork.fileUrl` to lokalny `blob:` URL (ważny tylko w tej karcie) — do zastąpienia URL-em z backendu.
