const apiKey = require("./config.json").meme_api_key;
const url = 'https://api.apileague.com/retrieve-random-meme?keywords=water,drink,hydrate';

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

//custom_keywords - comma separated ("rocket,thrash,panda")
//hydrate_keyword_chance - percentage possibility of the hydrate keyword being used
async function fetch_meme_url(custom_keywords = "", hydrate_keyword_chance = 15, water_keyword_chance = 100, drink_keyword_chance = 100) {
  let keywords_candidates = [
    { name: "hydrate", chance: hydrate_keyword_chance },
    { name: "water", chance: water_keyword_chance },
    { name: "drink", chance: drink_keyword_chance },
  ]
  keywords = []
  for (candidate of keywords_candidates) {
    let rand = getRandomInt(100);
    if (rand < candidate.chance) {
      keywords.push(candidate.name);
    }
  }
  if (keywords.length == 0) {
    keywords.push(getRandomInt(keywords_candidates.length - 1));
  }

  return (await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey
    }
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      console.log(data);
      console.log(data.url);
      return { error: 0, url: data.url, keywords: keywords, cite: (keywords.includes("hydrate") ? "" : "\nmemes with the hydrate keyword are cringe so here you have some with less cringe :grin:") }
    })
    .catch((error) => {
      console.error('There was a problem with the fetch operation:', error);
      return { error: error };
    }))
}

exports.fetch_meme_url = fetch_meme_url