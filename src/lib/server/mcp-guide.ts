import 'server-only';

/** The short form, repeated in the server instructions and on the logging tools. */
export const LOGGING_RULES = 'Diary rules: one diary entry per physical dish (one bowl, plate, sandwich, shake); items eaten alongside each other are separate entries in the same meal. Estimate restaurant or ordered dishes ingredient by ingredient with full nutrient profiles, never as one whole-dish food. Take nutrients for whole and generic foods from the databases Cronometer uses (NCCDB, USDA); for packaged or restaurant items use the label, then fill gaps from those databases. Call get_logging_guide before logging food for the first time in a conversation.';

/** The full guide for agents that log food and workouts through this server. */
export const LOGGING_GUIDE = `# Santorio logging guide

Santorio is Rohin's personal food and training journal. You research and estimate; the app stores what Rohin approves. Show the proposed entries (name, meal, calories, protein, carbs, fat) and get a yes before writing anything.

## What one diary entry is

One entry is one physical dish: everything that sits in the same bowl, on the same plate, in the same sandwich, wrap or glass.

- Separate things eaten at the same time are separate entries in the same meal group. A breakfast of a golden kiwi, 7 blackberries, 4 chicken nuggets and a glass of milk is four entries: "Golden kiwi", "Blackberries", "Chicken nuggets", "2% milk".
- A dish is one entry whose ingredients are its components. A Teriyaki Madness chicken bowl is one entry: "Teriyaki Madness spicy chicken bowl", with rice, chicken, stir-fried vegetables and sauce as ingredients.
- A shake, smoothie or salad is one dish. A side ordered with it (fries, a drink) is its own entry.
- When unsure whether something is one dish, ask.

## Estimating dishes, especially restaurant and ordered food

- Break the dish into components and estimate an amount for each: base (rice, noodles, bread), protein, vegetables, sauce, cooking oil, toppings.
- Give every component a full nutrient profile (see Sources below), so vitamins and minerals are estimated for the whole meal. Do not create a single "whole bowl" food with bowl-level micronutrient guesses.
- If the restaurant publishes nutrition for the dish, scale the component amounts so calories, protein, carbs and fat land close to the published numbers. Cite the source in the entry notes.
- Mark the entry estimated = true whenever amounts are estimated.

## Sources

The app's nutrient fields mirror Cronometer's, so match Cronometer's data.

- Whole and generic foods, which is most foods (blackberries, kiwi, chicken breast, rice, milk): there is no first-party source, so take the full nutrient profile from the databases Cronometer uses, listed at https://support.cronometer.com/hc/en-us/articles/360018239472-Data-Sources. Prefer the lab-analyzed entries: NCCDB (University of Minnesota, Cronometer's largest source, about 70 nutrients per food) and USDA FoodData Central (SR Legacy / Foundation), then the Canadian, UK, Australian, Irish or Dutch composition tables.
- Packaged and restaurant items: use the label or the restaurant's published nutrition for what it covers (usually calories, macros and a few minerals), then fill the vitamins and minerals it leaves out from the closest generic entry in those same databases. Mark those values estimated and say so in notes, with sources in sourceUrl.

## Foods in the library

- Search the library first (search_foods) and reuse an existing food when it is the same thing. Create a food only when it is missing.
- Name foods plainly, the way Rohin would say them: "Golden kiwi", "Blackberries", "Chicken nuggets". Put the brand in brand ("Trader Joe's"), not in the name. Leave out words like "reference" or "label plus estimates" in names; that belongs in notes and sourceUrl.
- Give each food a defined basis: per 100 g is fine, or a natural unit with its weight in grams ("1 medium kiwi (75 g)", "1 cup (8 fl oz)").
- Energy, protein, carbs and fat must be known numbers. Every other nutrient is null when unknown, never zero. Enter zero only when it is known to be zero.

## Amounts and units

- Use whatever unit gets the nutrition math right; converting to grams is fine. The app doesn't show amounts in the diary.
- fl oz is volume; oz is weight. Do not convert between volume and weight without a known density.
- Keep Rohin's own words in the entry notes ("1 golden kiwi, 7 blackberries…") so the original amounts are never lost.

## Meals, dates and times

- Meal group: Breakfast, Lunch, Dinner, Snack or Supplements, from what Rohin says or the time he ate.
- Each supplement is its own entry in Supplements.
- The date is Rohin's local date (America/Los_Angeles unless his profile says otherwise). Time is optional: leave it out unless he gives it.

## Meal prep

Meal prep is only for food cooked as a batch and eaten in portions over days. Log those with log_meal source kind batch and the eaten fraction (or an amount of the anchor ingredient, such as dry pasta). Everything else is food entries.

## Corrections and duplicates

- Search the diary for the date before logging, so the same meal isn't logged twice.
- To fix an entry, read it with get_diary_entry and save it with save_diary_entry; don't log a second copy.
- To split a combined entry into separate items, log the separate entries, then ask Rohin to delete the combined one in the app.

## Workouts

- One workout session per training session. Keep each exercise's sets in order with weight and reps; a bare weight in Rohin's notes means he hit the target reps.
- Start and end times are optional. Include them only when known; never invent times for workouts logged after the fact.
- Use real exercise and location IDs from search_exercises and list_locations. Preserve Rohin's original notation in exercise or set notes.
`;
