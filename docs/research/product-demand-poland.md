# What Poles buy online, and what is growing

Research date: 28 September 2026. Sources: the Gemius "E-commerce w Polsce" reports (2023, 2024, 2025 editions), GUS "Społeczeństwo informacyjne w Polsce" (2023, 2024, 2025 editions), and Eurostat dataset `isoc_ec_ibgs` and `isoc_ec_ib20`. All numbers below were read from the primary PDFs or pulled from the Eurostat API. Nothing is estimated or interpolated.

## Summary

Clothing, shoes and accessories are by far the biggest online category in Poland in every source. Gemius puts clothing at 77% of online shoppers in 2025, and GUS puts clothes, shoes or accessories at 44.6% of all people aged 16 to 74 in 2025 (up from 37.5% in 2023). Cosmetics and beauty are a clear second (Gemius 65% of shoppers in 2025; GUS 23.9% of all people in 2025, up from 18.4% in 2023). After that come pharmacy products and supplements, books and media, electronics, and food (both groceries and restaurant meals). In the official statistics (GUS and Eurostat) almost every goods category grew from 2023 to 2025. The fastest growers relative to their size were medicine and dietary supplements (GUS 8.4% to 11.8% of all people), cleaning and personal hygiene products (8.5% to 12.3%), sports goods (7.4% to 10.5%), restaurant meal delivery (9.2% to 12.8%) and cosmetics. Gemius shows a flatter picture, because it measures the share of people who already shop online, and that group is saturated (78% of internet users buy online). In Gemius, jewelry (32% to 38%) and insurance (34% to 39%) rose, while children's goods and toys (43% to 35%), sports clothing (53% to 46%) and multimedia fell. On store choice, Gemius says price and delivery cost decide: attractive price 42% and low delivery cost 38% in 2025. Parcel lockers are the default delivery method (83%) and BLIK is the most used payment method (72% have used it).

## Sources

1. **Gemius, "E-commerce w Polsce 2025"** (fieldwork 17 to 24 July 2025, CAWI, N=1629 internet users aged 15+). [PDF](https://gemius.com/documents/81/RAPORT_E-COMMERCE_2025.pdf). Partners: Polskie Badania Internetu (PBI), IAB Polska, Kozminski University (ALK). Not e-Izba (see Limitations).
2. **Gemius, "E-commerce w Polsce 2024"** (fieldwork 12 to 18 August 2024, N=1546). [PDF](https://gemius.com/documents/66/RAPORT_E-COMMERCE_2024.pdf). Partners: PBI, IAB Polska.
3. **Gemius, "E-commerce w Polsce 2023"** (fieldwork 28 June to 6 July 2023, N=1608). [PDF](https://gemius.com/documents/54/RAPORT_e-commerce_2023.pdf). Partners: PBI, IAB Polska.
   - **Denominator for product categories:** people who bought online in the last 12 months (N=1218 in 2023, 1200 in 2024, 1262 in 2025). Question: "did you buy it online in the last 12 months". It is not the share of all internet users.
   - **Denominator for store choice, delivery and payment:** people who buy online (same sample of online shoppers).
   - Share of internet users who buy online: 79% (2023), 78% (2024), 78% (2025), per each edition.
4. **GUS (Statistics Poland), "Społeczeństwo informacyjne w Polsce w 2025 r."** (published 16 December 2025). [Page](https://stat.gov.pl/obszary-tematyczne/nauka-i-technika-spoleczenstwo-informacyjne/spoleczenstwo-informacyjne/spoleczenstwo-informacyjne-w-polsce-w-2025-r-,1,19.html), [PDF](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5497/1/19/1/spoleczenstwo_informacyjne_w_polsce_2025.pdf). Table 39 gives goods categories for 2021 to 2025.
5. **GUS, "Społeczeństwo informacyjne w Polsce w 2024 roku"** (published 16 December 2024). [Page](https://stat.gov.pl/obszary-tematyczne/nauka-i-technika-spoleczenstwo-informacyjne/spoleczenstwo-informacyjne/spoleczenstwo-informacyjne-w-polsce-w-2024-roku,1,18.html), [PDF](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5497/1/18/1/spoleczenstwo_informacyjne_w_polsce_2024_2.pdf). Table 33.
6. **GUS, "Społeczeństwo informacyjne w Polsce w 2023 roku"** (published 14 December 2023). [Page](https://stat.gov.pl/obszary-tematyczne/nauka-i-technika-spoleczenstwo-informacyjne/spoleczenstwo-informacyjne/spoleczenstwo-informacyjne-w-polsce-w-2023-roku,1,17.html), [PDF](https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/5497/1/17/1/spoleczenstwo_informacyjne_w_polsce_w_2023.pdf). Table 41.
   - **Denominators:** (a) % of all individuals aged 16 to 74 who bought the category online in the last 3 months ("w % ogółu osób"), given for 2021 to 2025 in the 2025 edition; (b) % of individuals who bought anything online in the last 3 months, given only in the 2023 and 2024 editions. The 2025 edition does not publish base (b).
   - Share of all people aged 16 to 74 who bought online in the last 3 months: 49.9% (2023), 53.9% (2024), 56.6% (2025) (GUS 2025, Table 38).
7. **Eurostat, dataset `isoc_ec_ibgs`** "Internet purchases - goods or services (2020 onwards)", last updated 17 April 2026. [Data browser](https://ec.europa.eu/eurostat/databrowser/view/isoc_ec_ibgs/default/table?lang=en), [API query used](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_ec_ibgs?geo=PL&format=JSON&lang=EN). Filter: geo=PL, ind_type=IND_TOTAL.
   - **Denominators used:** `PC_IND` (% of all individuals aged 16 to 74) and `PC_IND_BUY3` (% of individuals who bought online in the last 3 months). Reference period for categories: last 3 months.
   - Goods categories are published for 2020 to 2024 only. 2025 has services and subscriptions but no goods breakdown for Poland or the EU. So the last three goods years are 2022, 2023, 2024.
   - Values are published with two decimals; I rounded to one decimal.
8. **Eurostat, dataset `isoc_ec_ib20`** "Internet purchases by individuals (2020 onwards)". [Data browser](https://ec.europa.eu/eurostat/databrowser/view/isoc_ec_ib20/default/table?lang=en). Poland, bought online in the last 12 months: 64.3% (2023), 67.4% (2024), 69.7% (2025) of all individuals; 73.0%, 75.1%, 77.0% of people who used the internet in the last 12 months.
9. **Eurostat Statistics Explained, "E-commerce statistics for individuals"** (data extracted February 2026). [Article](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=E-commerce_statistics_for_individuals). The 2025 edition covers services (housing, tourism, entertainment) and does not report goods categories, which matches the dataset.

**Important:** GUS and Eurostat publish the same underlying survey (the EU ICT household survey, run in Poland by GUS). Their numbers for 2021 to 2024 match after rounding. I list them separately as asked, but they are not independent confirmations. GUS is the only source with 2025 goods numbers.

## Per category

Notation: "Gemius" = % of people who bought online in the last 12 months. "GUS all" and "Eurostat all" = % of all people aged 16 to 74, last 3 months. "Eurostat buyers" and "GUS buyers" = % of people who bought online in the last 3 months. Years are the data years.

### Clothing and footwear
- Mapping: Gemius "odzież, dodatki, akcesoria" (clothing and accessories) and "obuwie" (footwear), shown separately. Eurostat and GUS "clothes (including sport clothing), shoes or accessories".
- Gemius clothing: 80% (2023), 74% (2024), 77% (2025). Footwear: 67%, 65%, 65%.
- GUS all: 37.5% (2023), 41.7% (2024), 44.6% (2025). GUS buyers: 75.1% (2023), 77.3% (2024), 2025 no data.
- Eurostat all: 36.9% (2022), 37.5% (2023), 41.7% (2024). Eurostat buyers: 72.6%, 75.1%, 77.3%.
- Trend: growing in the official data (+7.1 points of all people, 2023 to 2025). Roughly flat in Gemius.

### Home and garden
- Mapping: Eurostat and GUS "furniture, home accessories or gardening products". This is the same category used for furniture below; they cannot be split. Gemius has no garden category, so no data.
- Gemius: no data.
- GUS all: 9.4% (2023), 11.5% (2024), 12.4% (2025). GUS buyers: 18.8% (2023), 21.3% (2024), 2025 no data.
- Eurostat all: 10.0% (2022), 9.4% (2023), 11.5% (2024). Eurostat buyers: 19.6%, 18.8%, 21.3%.
- Trend: growing since 2023 after a dip.

### Furniture and home decor
- Mapping: Gemius "meble i wystrój wnętrz" (furniture and interior decor). Eurostat and GUS: same combined category as home and garden above.
- Gemius: 36% (2023), 38% (2024), 35% (2025).
- GUS and Eurostat: see home and garden (same numbers).
- Trend: flat in Gemius; growing in GUS and Eurostat.

### Consumer electronics accessories
- Mapping: no source has an "accessories only" category. Gemius "telefony, smartfony, tablety, akcesoria GSM" (phones, tablets, GSM accessories). Eurostat and GUS "computers, tablets, mobile phones or accessories". Both include devices. Related but separate: Gemius "sprzęt RTV/AGD" and Eurostat/GUS "consumer electronics or household appliances", listed below for context.
- Gemius phones and accessories: 40% (2023), 38% (2024), 40% (2025).
- GUS all: 5.2% (2023), 6.3% (2024), 6.3% (2025). GUS buyers: 10.4% (2023), 11.7% (2024), 2025 no data.
- Eurostat all: 5.3% (2022), 5.2% (2023), 6.3% (2024). Eurostat buyers: 10.5%, 10.4%, 11.7%.
- Context, electronics and appliances: Gemius "sprzęt RTV/AGD" 50%, 47%, 46% (2023 to 2025). GUS all "consumer electronics or household appliances" 8.2%, 9.0%, 10.6% (2023 to 2025).
- Trend: flat in Gemius; small rise in the official data, flat in 2025.

### Beauty and cosmetics
- Mapping: Gemius "kosmetyki/perfumy" (cosmetics and perfume). Eurostat and GUS "cosmetics, beauty or wellness products".
- Gemius: 65% (2023), 62% (2024), 65% (2025).
- GUS all: 18.4% (2023), 21.6% (2024), 23.9% (2025). GUS buyers: 36.9% (2023), 40.1% (2024), 2025 no data.
- Eurostat all: 18.0% (2022), 18.4% (2023), 21.6% (2024). Eurostat buyers: 35.3%, 36.9%, 40.1%.
- Trend: clearly growing in the official data (+5.5 points of all people, 2023 to 2025). Flat in Gemius at a high level.

### Health and dietary supplements
- Mapping: Gemius "produkty farmaceutyczne" (pharmaceutical products). Eurostat and GUS "medicine or dietary supplements such as vitamins" (online prescription renewal excluded).
- Gemius: 57% (2023), 56% (2024), 57% (2025).
- GUS all: 8.4% (2023), 10.7% (2024), 11.8% (2025). GUS buyers: 16.8% (2023), 19.8% (2024), 2025 no data.
- Eurostat all: 7.3% (2022), 8.4% (2023), 10.7% (2024). Eurostat buyers: 14.3%, 16.8%, 19.8%.
- Trend: one of the fastest growers in the official data (8.4% to 11.8% of all people, 2023 to 2025). Flat in Gemius.

### Sports and outdoor
- Mapping: Gemius only has "odzież sportowa" (sports clothing). Eurostat and GUS have "sports goods (excluding sport clothing)". These measure different things.
- Gemius sports clothing: 53% (2023), 49% (2024), 46% (2025).
- GUS all, sports goods: 7.4% (2023), 9.7% (2024), 10.5% (2025). GUS buyers: 14.9% (2023), 17.9% (2024), 2025 no data.
- Eurostat all: 7.1% (2022), 7.4% (2023), 9.7% (2024). Eurostat buyers: 14.0%, 14.9%, 17.9%.
- Trend: sports equipment growing in the official data; sports clothing falling in Gemius.

### Toys and baby products
- Mapping: Gemius "artykuły dziecięce/zabawki" (children's articles and toys). Eurostat and GUS "children toys or childcare items".
- Gemius: 43% (2023), 36% (2024), 35% (2025).
- GUS all: 9.8% (2023), 10.3% (2024), 10.0% (2025). GUS buyers: 19.6% (2023), 19.2% (2024), 2025 no data.
- Eurostat all: 10.0% (2022), 9.8% (2023), 10.3% (2024). Eurostat buyers: 19.7%, 19.6%, 19.2%.
- Trend: flat in the official data; falling in Gemius.

### Pet supplies
- Mapping: no pet category in any source. In Eurostat and GUS it would fall under "other physical goods", which cannot be split out.
- Gemius: no data. GUS: no data. Eurostat: no data.

### Car parts and accessories
- Mapping: Gemius "samochody i części samochodowe" (cars and car parts). Eurostat and GUS "bicycles, mopeds, cars, or other vehicles or their spare parts". Both include vehicles, not just parts.
- Gemius: 31% (2023), 29% (2024), 28% (2025).
- GUS all: 4.4% (2023), 5.7% (2024), 5.2% (2025). GUS buyers: 8.9% (2023), 10.6% (2024), 2025 no data.
- Eurostat all: 5.4% (2022), 4.4% (2023), 5.7% (2024). Eurostat buyers: 10.5%, 8.9%, 10.6%.
- Trend: flat to slightly down in both.

### Books and media
- Mapping: Gemius "książki, płyty, filmy" (books, CDs, films). Also Gemius "multimedia (aplikacje, e-booki itp.)". Eurostat and GUS "printed books, magazines or newspapers". Eurostat also has e-books or audiobooks as downloads (2024 onward) and physical music and films (2023 to 2024).
- Gemius books, CDs, films: 57% (2023), 52% (2024), 53% (2025). Multimedia: 34%, 33%, 29%.
- GUS all, printed books etc.: 7.7% (2023), 8.3% (2024), 9.1% (2025). GUS buyers: 15.5% (2023), 15.4% (2024), 2025 no data.
- Eurostat all, printed books etc.: 7.8% (2022), 7.7% (2023), 8.3% (2024). Eurostat buyers: 15.2%, 15.5%, 15.4%.
- Eurostat all, e-books or audiobooks as downloads: 5.0% (2024), 5.7% (2025). Buyers: 9.2%, 10.1%.
- Eurostat all, music CDs/vinyl or films DVD/Blu-ray: 2.4% (2023), 3.7% (2024).
- Trend: slow growth in the official data; Gemius down from 2023, multimedia falling.

### DIY and tools
- Mapping: Gemius "materiały budowlane i wykończeniowe" (building and finishing materials). This is the closest match; tools are not named. Eurostat and GUS have no such category.
- Gemius: 27% (2023), 27% (2024), 27% (2025).
- GUS: no data. Eurostat: no data.
- Trend: flat in Gemius.

### Household chemicals
- Mapping: Eurostat and GUS "cleaning products or personal hygiene products". This also includes personal hygiene. Gemius has no such category.
- Gemius: no data.
- GUS all: 8.5% (2023), 10.4% (2024), 12.3% (2025). GUS buyers: 17.0% (2023), 19.2% (2024), 2025 no data.
- Eurostat all: 8.0% (2022), 8.5% (2023), 10.4% (2024). Eurostat buyers: 15.7%, 17.0%, 19.2%.
- Trend: one of the fastest growers in the official data (8.5% to 12.3% of all people, 2023 to 2025).

### Jewelry and watches
- Mapping: Gemius "biżuteria" (jewelry). Watches are not named. Eurostat and GUS have no separate category.
- Gemius: 32% (2023), 34% (2024), 38% (2025).
- GUS: no data. Eurostat: no data.
- Trend: growing in Gemius (+6 points, 2023 to 2025), one of the few Gemius categories that rose each year.

### Hobby and craft supplies
- Mapping: no direct match anywhere. The nearest Gemius category is "artykuły dla kolekcjonerów" (collectors' items), which is a weak match. Eurostat and GUS: would sit in "other physical goods".
- Gemius collectors' items: 17% (2023), 15% (2024), 15% (2025).
- GUS: no data. Eurostat: no data for this category. For context only, Eurostat all "other physical goods": 7.4% (2022), 7.7% (2023), 8.9% (2024).
- Trend: flat to slightly down in Gemius.

## Significant categories missing from the list

### Food: groceries and restaurant meals
- Mapping: Gemius "produkty spożywcze" (groceries) and "posiłki z restauracji" (restaurant meals, e.g. Uber Eats, Pyszne.pl). Eurostat and GUS "food or beverages from stores or from meal-kits providers" and "deliveries from restaurants, fast-food chains, catering services".
- Gemius groceries: 44% (2023), 43% (2024), 45% (2025). Restaurant meals: 49%, 48%, 48%.
- GUS all, food from stores: 5.8% (2023), 6.1% (2024), 7.0% (2025). Restaurant meals: 9.2%, 10.6%, 12.8%.
- GUS buyers, food from stores: 11.7% (2023), 11.2% (2024). Restaurant meals: 18.4%, 19.7%. 2025 no data.
- Eurostat all, food from stores: 5.2% (2022), 5.8% (2023), 6.1% (2024). Restaurant meals: 9.0%, 9.2%, 10.6%.
- Trend: restaurant delivery growing fast in the official data; groceries growing slowly. Flat in Gemius.

### Travel and event tickets
- Mapping: Gemius "bilety do kina/teatru" (cinema and theatre tickets) and "podróże, rezerwacja" (travel, bookings). Eurostat "tickets to events" (2024 onward; 2023 used two older categories), "transport service from a transport enterprise" and "rented accommodation from enterprises". GUS does not publish services in these tables.
- Gemius tickets: 47% (2023), 48% (2024), 46% (2025). Travel and bookings: 44%, 43%, 43%.
- Eurostat all, tickets to events: 13.5% (2024), 16.3% (2025). Buyers: 25.1%, 28.7%. 2023 is a break in series (cultural events 14.1%, sport events 4.8% of all individuals).
- Eurostat all, transport from enterprises: 12.7% (2023), 15.1% (2024), 16.1% (2025). Buyers: 25.4%, 28.0%, 28.4%.
- Eurostat all, accommodation from enterprises: 7.3% (2023), 10.9% (2024), 12.1% (2025). Buyers: 14.6%, 20.2%, 21.3%.
- GUS: no data.
- Trend: growing in Eurostat; flat in Gemius.

### Streaming and digital subscriptions
- Mapping: Eurostat "paid subscription to a films, series or sports streaming service" and "to a music streaming service" (2024 onward). Gemius has no direct subscription category (closest is "multimedia", covered under books and media). GUS does not publish it in these tables.
- Eurostat all, film/series/sport streaming: 21.9% (2024), 26.8% (2025). Buyers: 40.7%, 47.3%.
- Eurostat all, music streaming: 11.0% (2024), 14.0% (2025). Buyers: 20.4%, 24.8%.
- Gemius: no data. GUS: no data.
- Trend: growing fast, but only two years exist under the current definition.

Also worth noting from Gemius (not added as a full section): insurance ("ubezpieczenia") 34% (2023), 37% (2024), 39% (2025) of online shoppers.

## What makes Polish shoppers choose a store

Only Gemius asks this. GUS and Eurostat have no store choice, delivery or payment preference questions in the tables used here, so they are "no data" for this whole section. Gemius base: people who buy online (N=1235 in 2023, 1200 in 2024, 1262 in 2025, for the store choice question).

**Why they pick a store for a first purchase** (Gemius question: "What makes you decide to make your first purchase in a given online store rather than another one offering similar products?"). 2023 / 2024 / 2025:
- Attractive product price: 46% / 43% / 42%.
- Low shipping or delivery cost: 42% / 39% / 38%.
- Positive earlier experience: 36% / 30% / 32%.
- Short delivery time: 23% / 26% / 26%.
- Attractive promotions: 25% / 22% / 25%.
- Easy payment (card, fast transfer, BLIK): 21% / 24% / 23%.
- Discount codes: 17% / 17% / 19%.
- Option to choose a specific parcel locker: not asked / not asked / 19%.
- Several payment methods: 17% / 19% / 17%.
- Several delivery methods: 17% / 18% / 15%.
- Clear information on order, complaint and return terms: 16% / 14% / 15%.
- Reviews on websites and portals: 17% / 14% / 15%.
- Price comparison sites: 14% / 11% / 10%.
- Longer period for returns without giving a reason: 7% / 6% / 7%.

**Delivery method used most often** (Gemius). 2023 / 2024 / 2025:
- Parcel locker (paczkomat): 82% / 81% / 83%.
- Courier to home or work: 42% / 43% / 39%.
- Partner pickup point (e.g. Żabka, ORLEN): 18% / 20% / 23%.
- Post, delivered by postman: 17% / 15% / 16%.
- Store pickup (click and collect): 6% / 7% / 8%.

**Delivery methods that most encourage buying online** (Gemius). 2023 / 2024 / 2025: parcel locker 86% / 85% / 86%; courier 62% / 60% / 56%; partner pickup point 38% / 35% / 38%.

**Delivery cost and free delivery** (Gemius):
- "Lower delivery costs" as a reason to buy online more often: 53% (2023), 49% (2024), 47% (2025). It was the top answer in 2025.
- "Lower prices than in physical stores": 53% (2023), 51% (2024), 46% (2025).
- 2025, among people who said delivery cost would motivate them (N=596), the share expecting free delivery: 33% for a 20 zł order, 41% for 50 zł, 59% for 100 zł, 73% for 300 zł, 77% for 500 zł.
- Delivery within 12 hours would motivate more frequent buying for 83% (2023), 91% (2024), 88% (2025) of those who named delivery time as a motivator. Delivery within 24 hours: 45% (2025).

**Free returns** (Gemius 2025, N=1262): return options that most encourage buying online are free return via parcel locker 42%, free return to a physical store 40%, free return by courier 33%, a return window longer than 14 days 31%, free return at a partner point 30%. Most used return method in 2025 (N=1115 who knew about returns): free return via parcel locker 40%; 18% never returned anything. Returns data for 2023 and 2024: not extracted (see Limitations).

**Payment methods** (Gemius). 2023 / 2024 / 2025:
- BLIK ever used for online shopping: 63% / 68% / 72%.
- Fast bank transfer via payment service (PayU, Przelewy24, Tpay): 69% / 64% / 64%.
- Payment method used most often: BLIK 47% / 51% / 56%; fast transfer 26% / 22% / 20%.
- Card at checkout: 43% in 2025.
- BLIK overtook fast transfers on "ever used" in 2024. It was already the method used most often in 2023.

**Trust in a new store** (Gemius 2025, pick up to three): reviews of the store 43%, several payment methods 33%, clear return and complaint information 28%, cash on delivery 24%, office address in Poland 21%, presence in rankings and price comparison sites 18%.

## Limitations

- **e-Izba is not a partner of the Gemius report.** The 2023 to 2025 "E-commerce w Polsce" editions were made by Gemius with PBI and IAB Polska (plus Kozminski University in 2025). e-Izba publishes its own consumer report, "Omni-commerce. Kupuję wygodnie" (made by Mobile Institute), but only an abridged version is public ([2025 abridged PDF](https://eizba.pl/wp-content/uploads/2025/07/Omni-commerce-Kupuje-wygodnie-2025-skrot.pdf)); the full report is for members only. I did not use it for numbers.
- **No 2026 Gemius edition** was published as of 28 September 2026 that I could find. The latest is 2025 (fieldwork July 2025).
- **Eurostat has no 2025 goods breakdown.** `isoc_ec_ibgs` has goods categories only through 2024, for Poland and the EU. GUS 2025 is the only source with 2025 goods numbers.
- **GUS 2025 does not publish the "% of online buyers" base**, only "% of all individuals". I did not compute it by dividing, so it is "no data".
- **GUS and Eurostat are the same survey.** Treat them as one official source published twice, not two independent sources.
- **Different denominators.** Gemius counts people who shopped online in the last 12 months and asks about a long list, so its shares are high (often 30% to 80%). GUS and Eurostat count the last 3 months, either of all people aged 16 to 74 (shares mostly 5% to 45%) or of recent online buyers. Never compare a Gemius number directly with a GUS or Eurostat number.
- **Gemius sample sizes are about 1,200 online shoppers per year.** Changes of 2 to 3 points between editions may be sampling noise. I did not find margins of error for the category chart in the reports.
- **Mapping caveats.** Home and garden and furniture share one Eurostat/GUS category. "Consumer electronics accessories" maps to categories that include phones, tablets and computers. Car parts categories include whole vehicles. Household chemicals (Eurostat/GUS) include personal hygiene. Sports is equipment in Eurostat/GUS but clothing in Gemius. DIY (building materials) and hobby (collectors' items) mappings are rough. Pet supplies have no data anywhere.
- **Gemius charts were read from rendered PDF pages**, because text extraction scrambled some labels. Numbers were checked against the chart images.
- **Gemius returns data for 2023 and 2024** and the full 2023 and 2024 trust charts were not extracted, so no trend is given for those items.
- **Break in Eurostat series in 2024** for tickets, e-books and streaming (new definitions), so only 2024 to 2025 are comparable there.

## Final table

"Gemius" = % of people who bought online in the last 12 months. "GUS" = % of all individuals aged 16 to 74, last 3 months. Trends compare the first and last year shown.

| Category | Share of shoppers | Trend | Source |
|---|---|---|---|
| Clothing and footwear | Clothing 77%, footwear 65% | Flat (clothing 80% to 77%) | Gemius 2025 (trend 2023-2025) |
| Clothing and footwear | 44.6% of all people | Up from 37.5% | GUS 2025 (trend 2023-2025) |
| Home and garden | 12.4% of all people | Up from 9.4% | GUS 2025, furniture/home/garden (trend 2023-2025) |
| Home and garden | no data | no data | Gemius 2023-2025 |
| Furniture and home decor | 35% | Flat (36% to 35%) | Gemius 2025 (trend 2023-2025) |
| Furniture and home decor | 12.4% of all people (shared category) | Up from 9.4% | GUS 2025 (trend 2023-2025) |
| Consumer electronics accessories | 40% (phones, tablets, accessories) | Flat (40% to 40%) | Gemius 2025 (trend 2023-2025) |
| Consumer electronics accessories | 6.3% of all people (computers, phones, accessories) | Up slightly from 5.2% | GUS 2025 (trend 2023-2025) |
| Beauty and cosmetics | 65% | Flat (65% to 65%) | Gemius 2025 (trend 2023-2025) |
| Beauty and cosmetics | 23.9% of all people | Up from 18.4% | GUS 2025 (trend 2023-2025) |
| Health and dietary supplements | 57% (pharmaceutical products) | Flat (57% to 57%) | Gemius 2025 (trend 2023-2025) |
| Health and dietary supplements | 11.8% of all people | Up from 8.4% | GUS 2025 (trend 2023-2025) |
| Sports and outdoor | 46% (sports clothing) | Down from 53% | Gemius 2025 (trend 2023-2025) |
| Sports and outdoor | 10.5% of all people (sports goods) | Up from 7.4% | GUS 2025 (trend 2023-2025) |
| Toys and baby products | 35% | Down from 43% | Gemius 2025 (trend 2023-2025) |
| Toys and baby products | 10.0% of all people | Flat (9.8% to 10.0%) | GUS 2025 (trend 2023-2025) |
| Pet supplies | no data | no data | Gemius, GUS, Eurostat |
| Car parts and accessories | 28% (cars and car parts) | Down slightly from 31% | Gemius 2025 (trend 2023-2025) |
| Car parts and accessories | 5.2% of all people (vehicles and parts) | Up slightly from 4.4% | GUS 2025 (trend 2023-2025) |
| Books and media | 53% (books, CDs, films) | Down from 57% | Gemius 2025 (trend 2023-2025) |
| Books and media | 9.1% of all people (printed books, press) | Up from 7.7% | GUS 2025 (trend 2023-2025) |
| DIY and tools | 27% (building and finishing materials) | Flat (27% to 27%) | Gemius 2025 (trend 2023-2025) |
| DIY and tools | no data | no data | GUS, Eurostat |
| Household chemicals | 12.3% of all people (cleaning and hygiene) | Up from 8.5% | GUS 2025 (trend 2023-2025) |
| Household chemicals | no data | no data | Gemius 2023-2025 |
| Jewelry and watches | 38% (jewelry) | Up from 32% | Gemius 2025 (trend 2023-2025) |
| Jewelry and watches | no data | no data | GUS, Eurostat |
| Hobby and craft supplies | 15% (collectors' items, weak match) | Down slightly from 17% | Gemius 2025 (trend 2023-2025) |
| Hobby and craft supplies | no data | no data | GUS, Eurostat |
| Food: groceries | 45% | Flat (44% to 45%) | Gemius 2025 (trend 2023-2025) |
| Food: restaurant meals | 12.8% of all people | Up from 9.2% | GUS 2025 (trend 2023-2025) |
| Travel and event tickets | 16.3% of all people (event tickets) | Up from 13.5% | Eurostat 2025 (trend 2024-2025) |
| Streaming subscriptions | 26.8% of all people (film, series, sport) | Up from 21.9% | Eurostat 2025 (trend 2024-2025) |
