# BC helperis (eAMF -> Business Central)

Ērts palīgs AM Furnitūra komandai: ātra preču un daudzumu atlase no **eamf.lv** un ievietošana **Microsoft Business Central** pasūtījumos.

[![Jaunākā versija](https://img.shields.io/github/v/release/kaspars1985/BC-Helperis?color=ff5501&label=Jaunākā%20versija)](https://github.com/kaspars1985/BC-Helperis/releases/latest)

📥 **Kolēģu lejupielādes saite:** [BC-helperis.zip (Vienmēr jaunākā versija)](https://github.com/kaspars1985/BC-Helperis/releases/latest/download/BC-helperis.zip)

---

## 🚀 Kā tas atvieglo ikdienas darbu?

Līdz šim, ievadot pasūtījumus Business Central (BC), katrs artikuls bija manuāli jāpārkopē no `eamf.lv`, pārslēdzoties starp cilnēm desmitiem reižu. 

Ar **BC helperi**:
1. **Nav jāpārslēdzas starp cilnēm pie katras preces:** Pārlūkojiet `eamf.lv` un ar vienu klikšķi pievienojiet preces peldošajā grozā ar pogu **`+ BC`**.
2. **Automātiska izmēru un variantu atpazīšana:** Ja precei ir varianti (piem., galda virsmai `600 mm` vai `920 mm`), paplašinājums automātiski nolasa tieši izvēlētā izmēra reālo artikula numuru.
3. **Vairāku atvērto BC pasūtījumu atbalsts:** Ja pārlūkā atvērti vairāki pasūtījumi, paplašinājums parāda vizuālu sarakstu ar numuru un klienta vārdu (piem., `PPAS0012345 · Klienta Nosaukums`), ļaujot ar 1 klikšķi izvēlēties vajadzīgo.
4. **Viena klikšķa ielīmēšana:** Viss saraksts tiek sagatavots precīzā BC tabulas ielīmēšanas formātā (`Ctrl+V`), automātiski aizpildot kolonnas *Tips (Prece)*, *Nr.* un *Pasūtītais daudzums*.

---

## 📦 Uzstādīšanas instrukcija (Aizņem 30 sekundes)

### Microsoft Edge pārlūkā:
1. Izvelciet (Unzip) lejupielādēto arhīvu `BC-helperis.zip` jebkurā mapē datorā.
2. Atveriet Microsoft Edge un adreses joslā ievadiet:
   ```text
   edge://extensions
   ```
   *(vai nospiediet `...` izvēlni augšā pa labi -> **Paplašinājumi** -> **Pārvaldīt paplašinājumus**)*.
3. Kreisajā sānjoslā **ieslēdziet slēdzi "Developer mode"** (Izstrādātāja režīms).
4. Lapas augšpusē parādīsies poga **"Load unpacked"** (Ielādēt neiepakotu).
5. Uzklikšķiniet uz tās un norādiet izvilkto mapi `BC-helperis`.
6. Edge rīkjoslā (pie puzles ikonas) uzklikšķiniet uz **acs ikonas** pie *"BC helperis"*, lai ikona vienmēr būtu redzama.

---

### Google Chrome pārlūkā:
1. Izvelciet arhīvu `BC-helperis.zip`.
2. Atveriet Google Chrome un adreses joslā ievadiet:
   ```text
   chrome://extensions
   ```
3. Augšējā labajā stūrī **ieslēdziet slēdzi "Developer mode"**.
4. Augšējā kreisajā pusē nospiediet pogu **"Load unpacked"** un norādiet mapi.
5. Piespraudiet (pin) ikonu rīkjoslā pie puzles simbola.

---

## 🛠️ Lietošana ikdienā

### 1. Preču pievienošana vietnē `eamf.lv`
- **Ar oranžo pogu "+ BC":** Atveriet jebkuru preču sarakstu vai preces kartīti vietnē `eamf.lv`. Pie katras preces un pie daudzuma lauka atrodas poga **`+ BC`** (precēm ar specifisku soli poga parāda piemēram **`+ 5m BC`**).
- **Automātisks preces solis (ABS malas, virsmas):** 
  - ABS malām ar platumu 23 mm (kodi `.08.23`, `.2.23` u.c.) solis automātiski ir **5 m** gan no meklēšanas rezultātiem, gan kartītē, novēršot kļūdas pie ielīmēšanas Business Central.
  - Galda virsmām un sienas paneļiem (`76.`, `79.`) tiek ievērots solis **0,5**.
- **Meklēšanas uznirstošajā logā:** Ierakstiet meklētājā artikula kodu vai nosaukumu — atrastajās precēs parādās:
  - Pilnajiem artikuliem: poga **`+ BC`** vai **`+ 5m BC`** (uzreiz pievieno buferim atbilstošā solī un atstāj meklēšanas logu atvērtu, lai var pievienot vairākas preces);
  - Precēm ar `.00` (galda virsmām, ABS malām ar izmēru variantiem): poga **`Izvēlēties izmēru ➔`**, kas aizved uz kartīti precīza izmēra izvēlei.
- **Ar peles labo taustiņu:** Iezīmējiet jebkuru artikula tekstu vietnē, uzklikšķiniet labo peles taustiņu un izvēlieties **"Pievienot BC helperim"**.

### 2. Peldošais bufera panelis
- Lapas apakšējā labajā stūrī redzams apaļš indikators ar preču skaitu.
- Uzklikšķinot uz tā, izbīdās pārskatāms panelis:
  - Redzams artikuls, nosaukums, cena, preces solis un daudzums;
  - **Artikulu var rediģēt uz vietas**, ja tas nepieciešams pirms kopēšanas;
  - Daudzumu var mainīt ar `[-]` un `[+]` pogām atbilstoši preces solim (piem., 5 ➔ 10 ➔ 15 m) vai ierakstīt lauciņā;
  - Nevajadzīgās preces var dzēst ar `✕`;
  - Dati saglabājas automātiski pat tad, ja aizverat vai pārlādējat lapu!

### 3. Pārslēgšanās uz Business Central un ielīmēšana
1. Panelī nospiediet pogu **"Pārslēgties uz BC pasūtījumu"**:
   - **Ja atvērts 1 pasūtījums:** Dati tiek nokopēti un pārlūks uzreiz aktivizē šo cilni.
   - **Ja atvērti vairāki pasūtījumi:** Parādās izvēles logs ar visiem atvērtajiem pasūtījumiem (`PPAS0012345 · Klienta Nosaukums`). Uzklikšķiniet uz vajadzīgā!
2. Business Central pasūtījuma logā:
   - Uzklikšķiniet uz tukšas rindas pirmajā kolonnā **Tips** (lai tā ir aktīvā šūna);
   - Nospiediet klaviatūras taustiņu kombināciju **`Ctrl + V`**;
   - Business Central automātiski ievieto *Prece*, artikula kodu un pasūtīto daudzumu, kā arī pats ielasīs no sistēmas nosaukumu, mērvienību un cenas!

---

## ⚙️ Kas jādara, ja kolēģim kolonnu secība Business Central atšķiras?

Business Central datus ielīmē no kreisās uz labo pusi. Ja kāds kolēģis ir personalizējis savu BC skatu un kolonnu secība atšķiras:

1. Bufera paneļa augšpusē uzklikšķiniet uz **Zobrata ikonas (⚙️ Iestatījumi)**.
2. Izvēlieties sev atbilstošo kolonnu formātu:
   - **AM Furnitūra / BC (Noklusējums):** `Prece` ➔ `Nr.` ➔ `Pasūtītais daudzums` *(klikšķina uz 1. kolonnas "Tips")*;
   - **Kompakts:** `Nr.` ➔ `Pasūtītais daudzums` *(ja kolonna "Tips" ir paslēpta vai klikšķina uzreiz uz "Nr.")*;
   - **Standarta EN:** `Item` ➔ `No.` ➔ `Quantity`;
   - **Pielāgota veidne (Custom):** Iespēja brīvi definēt savu kolonnu secību ar `\t` (Tab) atdalītājiem (piem., `{No}\t{Name}\t{Qty}`).
3. Nospiediet **"Saglabāt iestatījumus"**. Iestatījumi saglabājas konkrētajā datorā un citus kolēģus neietekmē.

---

## 📁 Papildu iespējas
- **CSV / Excel eksports:** Ja pasūtījumu nepieciešams saglabāt failā vai pārsūtīt, paneļa apakšā nospiediet **"Lejupielādēt CSV (Excel)"**. Fails satur artikulus, nosaukumus, daudzumus un cenas korektā UTF-8 kodējumā ar visiem latviešu burtiem.
- **Rīkjoslas logs (Popup):** Uzklikšķinot uz paplašinājuma ikonas pārlūka rīkjoslā, var pārbaudīt bufera saturu un veikt kopēšanu arī neesot `eamf.lv` lapā.

---

## 💬 Atsauksmes un atbalsts
Ja pamanāt kļūdu vai ir ieteikumi uzlabojumiem:  
- Kolēģi aicināti ziņot, izmantojot saziņas saiti tieši paplašinājuma bufera panelī vai iekšējos uzņēmuma kanālos.
- Kļūdu pieteikumiem un ieteikumiem var izmantot arī [GitHub Issues](https://github.com/kaspars1985/BC-Helperis/issues).
