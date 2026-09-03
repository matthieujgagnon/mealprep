curl -X POST http://localhost:4000/api/recipes \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Char Siu Chicken Banh Mi",
    "sourceUrl": "https://www.vice.com/en/article/char-siu-chicken-banh-mi-recipe/",
    "photoUrl": "https://www.vice.com/wp-content/uploads/sites/2/2019/05/1556740921720-banh-mi-sandwich-andrea-recipe.jpeg",
    "baseServings": 4,
    "prepTimeMinutes": 15,
    "cookTimeMinutes": 15,
    "inImported": true,
    "instructions": [
      {"text": "Make the Viet pickle: Peel and cut the daikon into sticks about 3 inches long and ¼-inch thick. Peel and cut the carrot into sticks a little skinnier than the daikon.", "image": null},
      {"text": "Put both vegetables in a bowl and toss with the salt and 2 teaspoons sugar. Massage and knead for 3 minutes, or set aside for 20 minutes, until you can bend a piece of daikon without breaking. They will have lost about a quarter of their original volume.", "image": null},
      {"text": "Rinse the vegetables with water, drain and press to expel excess water. Transfer to a 4-cup jar. Stir together the ½ cup sugar with the vinegar and 1 cup water until dissolved. Pour into the jar to cover the vegetables and let sit for 1 hour. Use immediately or refrigerate for up to 1 month.", "image": null},
      {"text": "Prepare the char siu chicken: Pat the chicken thighs dry with paper towels, then trim any big fat pads. If the thighs are large or uneven, butterfly each one by slashing the big mound of flesh horizontally to create a flap, stopping just shy of cutting through. Fold back the flap so the thigh is about 50% longer and even in thickness.", "image": null},
      {"text": "In a large bowl, stir together the garlic, five-spice powder, honey, hoisin, soy sauce, ketchup, and sesame oil. Remove 3 tablespoons and set aside for glazing. Add the chicken to the bowl, coat well, cover and marinate at room temperature for 30 minutes (or refrigerate up to 24 hours).", "image": null},
      {"text": "Lightly oil a cast-iron grill pan and set over medium-high heat. Add the chicken and cook for 6–10 minutes, turning several times, until clear juices flow when pierced. During the last 2 minutes, baste with the reserved marinade. Transfer to a platter and rest for 5–10 minutes.", "image": null},
      {"text": "Make the sandwich: If the bread is soft, rub the crust with wet hands and crisp in a 350°F oven for about 7 minutes. Otherwise bake at 325°F for 3–6 minutes. Let cool, then slit open horizontally, keeping a hinge. Hollow out some of the inside.", "image": null},
      {"text": "Spread your chosen fat on both cut sides of the bread. Season as you like, layer the chicken on the bottom half, and top with the Viet pickle. Close and cut crosswise or keep whole.", "image": null}
    ],
    "ingredients": [
      {"name": "Daikon", "quantity": 454, "unit": "g", "group": "Viet pickle", "position": 0},
      {"name": "Carrot", "quantity": 171, "unit": "g", "group": "Viet pickle", "position": 1},
      {"name": "Fine sea salt", "quantity": 1, "unit": "tsp", "group": "Viet pickle", "position": 2},
      {"name": "Granulated sugar", "quantity": 0.5, "unit": "cup", "group": "Viet pickle", "position": 3},
      {"name": "Distilled white vinegar", "quantity": 1.25, "unit": "cup", "group": "Viet pickle", "position": 4},
      {"name": "Boneless skinless chicken thighs", "quantity": 794, "unit": "g", "group": "Char siu chicken", "position": 5},
      {"name": "Garlic clove, minced", "quantity": 1, "unit": null, "group": "Char siu chicken", "position": 6},
      {"name": "Chinese five-spice powder", "quantity": 0.25, "unit": "tsp", "group": "Char siu chicken", "position": 7},
      {"name": "Honey", "quantity": 2, "unit": "tbsp", "group": "Char siu chicken", "position": 8},
      {"name": "Hoisin sauce", "quantity": 2, "unit": "tbsp", "group": "Char siu chicken", "position": 9},
      {"name": "Soy sauce", "quantity": 1.5, "unit": "tbsp", "group": "Char siu chicken", "position": 10},
      {"name": "Ketchup", "quantity": 1, "unit": "tbsp", "group": "Char siu chicken", "position": 11},
      {"name": "Toasted sesame oil", "quantity": 2, "unit": "tsp", "group": "Char siu chicken", "position": 12},
      {"name": "Baguette or bolillo roll", "quantity": null, "unit": null, "group": "Bread", "position": 13},
      {"name": "Mayonnaise or avocado", "quantity": null, "unit": null, "group": "Fat", "position": 14},
      {"name": "Jalapeño or fresno chile", "quantity": 4, "unit": null, "group": "Sandwich", "position": 15},
      {"name": "Cucumber strips", "quantity": 6, "unit": null, "group": "Sandwich", "position": 16},
      {"name": "Cilantro, mint, or basil", "quantity": 2, "unit": "tbsp", "group": "Sandwich", "position": 17}
    ]
  }'
