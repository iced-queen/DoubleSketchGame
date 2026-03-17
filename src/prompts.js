'use strict';

// ── Prompt pairs ──────────────────────────────────────────────────────────────
//
// Each pair has a real prompt and a decoy prompt that looks similar when drawn.
// The real drawer gets `real`, the decoy drawer gets `decoy`.
// Add or edit pairs freely — just keep both items visually similar enough
// to cause confusion on the shared canvas.
//

const PROMPT_PAIRS = [
  // ── Food & nature ─────────────────────────────────────────────────────────
  { real: 'apple',          decoy: 'tomato'          },
  { real: 'moon',           decoy: 'banana'          },
  { real: 'cloud',          decoy: 'sheep'           },
  { real: 'sun',            decoy: 'flower'          },
  { real: 'tree',           decoy: 'broccoli'        },
  { real: 'ice cream',      decoy: 'lamp'            },
  { real: 'mushroom',       decoy: 'umbrella'        },
  { real: 'cactus',         decoy: 'candle'          },
  { real: 'lemon',          decoy: 'star'            },
  { real: 'pear',           decoy: 'light bulb'      },
  { real: 'cherry',         decoy: 'balloon'         },
  { real: 'watermelon',     decoy: 'beach ball'      },
  { real: 'carrot',         decoy: 'rocket'          },
  { real: 'onion',          decoy: 'hot air balloon' },
  { real: 'pineapple',      decoy: 'christmas tree'  },
  { real: 'grapes',         decoy: 'balloons'        },
  { real: 'egg',            decoy: 'stone'           },
  { real: 'bread',          decoy: 'pillow'          },
  { real: 'pizza',          decoy: 'clock'           },
  { real: 'donut',          decoy: 'life ring'       },
  { real: 'cookie',         decoy: 'coin'            },
  { real: 'popcorn',        decoy: 'clouds'          },
  { real: 'pretzel',        decoy: 'infinity sign'   },
  { real: 'strawberry',     decoy: 'heart'           },

  // ── Animals ───────────────────────────────────────────────────────────────
  { real: 'snake',          decoy: 'rope'            },
  { real: 'shark',          decoy: 'dolphin'         },
  { real: 'elephant',       decoy: 'rhino'           },
  { real: 'spider',         decoy: 'snowflake'       },
  { real: 'fish',           decoy: 'kite'            },
  { real: 'cat',            decoy: 'fox'             },
  { real: 'rabbit',         decoy: 'dog'             },
  { real: 'owl',            decoy: 'penguin'         },
  { real: 'swan',           decoy: 'hook'            },
  { real: 'snail',          decoy: 'spiral'          },
  { real: 'crab',           decoy: 'spider'          },
  { real: 'butterfly',      decoy: 'bow tie'         },
  { real: 'bee',            decoy: 'wasp'            },
  { real: 'frog',           decoy: 'toad'            },
  { real: 'camel',          decoy: 'horse'           },
  { real: 'crocodile',      decoy: 'lizard'          },
  { real: 'whale',          decoy: 'submarine'       },
  { real: 'turtle',         decoy: 'helmet'          },
  { real: 'flamingo',       decoy: 'crane'           },
  { real: 'jellyfish',      decoy: 'parachute'       },
  { real: 'scorpion',       decoy: 'crab'            },
  { real: 'bat',            decoy: 'bird'            },
  { real: 'hedgehog',       decoy: 'porcupine'       },
  { real: 'octopus',        decoy: 'spider'          },
  { real: 'seahorse',       decoy: 'question mark'   },
  { real: 'penguin',        decoy: 'bowling pin'     },

  // ── Objects & tools ───────────────────────────────────────────────────────
  { real: 'anchor',         decoy: 'mushroom'        },
  { real: 'crown',          decoy: 'fence'           },
  { real: 'sword',          decoy: 'key'             },
  { real: 'lightning',      decoy: 'arrow'           },
  { real: 'rainbow',        decoy: 'bridge'          },
  { real: 'hammer',         decoy: 'lollipop'        },
  { real: 'guitar',         decoy: 'tennis racket'   },
  { real: 'clock',          decoy: 'steering wheel'  },
  { real: 'hand',           decoy: 'fork'            },
  { real: 'castle',         decoy: 'robot'           },
  { real: 'rocket',         decoy: 'pencil'          },
  { real: 'mountain',       decoy: 'volcano'         },
  { real: 'umbrella',       decoy: 'parachute'       },
  { real: 'key',            decoy: 'wrench'          },
  { real: 'trophy',         decoy: 'vase'            },
  { real: 'tent',           decoy: 'pyramid'         },
  { real: 'bridge',         decoy: 'gate'            },
  { real: 'ladder',         decoy: 'fence'           },
  { real: 'magnet',         decoy: 'horseshoe'       },
  { real: 'scissors',       decoy: 'crab claw'       },
  { real: 'hourglass',      decoy: 'bow tie'         },
  { real: 'compass',        decoy: 'clock'           },
  { real: 'lantern',        decoy: 'birdcage'        },
  { real: 'barrel',         decoy: 'drum'            },
  { real: 'bucket',         decoy: 'hat'             },
  { real: 'bell',           decoy: 'skirt'           },
  { real: 'bomb',           decoy: 'apple'           },
  { real: 'shield',         decoy: 'badge'           },
  { real: 'telescope',      decoy: 'cannon'          },
  { real: 'sailboat',       decoy: 'shark fin'       },
  { real: 'kite',           decoy: 'diamond'         },
  { real: 'chair',          decoy: 'throne'          },
  { real: 'candle',         decoy: 'chess pawn'      },
  { real: 'broom',          decoy: 'mop'             },
  { real: 'axe',            decoy: 'guitar'          },
  { real: 'torch',          decoy: 'ice cream'       },
  { real: 'jar',            decoy: 'vase'            },
  { real: 'balloon',        decoy: 'lightbulb'       },
  { real: 'envelope',       decoy: 'mountain'        },
  { real: 'crown',          decoy: 'cityscape'       },
  { real: 'flag',           decoy: 'golf club'       },
  { real: 'bow and arrow',  decoy: 'fishing rod'     },
  { real: 'traffic cone',   decoy: 'wizard hat'      },
  { real: 'wheelchair',     decoy: 'shopping cart'   },
  { real: 'satellite dish', decoy: 'frying pan'      },
  { real: 'ice cube',       decoy: 'dice'            },
  { real: 'spiral',         decoy: 'snail shell'     },
  { real: 'chain',          decoy: 'necklace'        },
  { real: 'syringe',        decoy: 'rocket'          },
  { real: 'boomerang',      decoy: 'eyebrows'        },

  // ── Buildings & places ────────────────────────────────────────────────────
  { real: 'igloo',          decoy: 'dome'            },
  { real: 'lighthouse',     decoy: 'rocket'          },
  { real: 'windmill',       decoy: 'fan'             },
  { real: 'pyramid',        decoy: 'mountain'        },
  { real: 'well',           decoy: 'bucket'          },
  { real: 'barn',           decoy: 'house'           },
  { real: 'arch',           decoy: 'rainbow'         },
  { real: 'fountain',       decoy: 'trophy'          },
  { real: 'fence',          decoy: 'ladder'          },
  { real: 'cave',           decoy: 'arch'            },

  // ── People & body ─────────────────────────────────────────────────────────
  { real: 'glasses',        decoy: 'handcuffs'       },
  { real: 'footprint',      decoy: 'leaf'            },
  { real: 'lips',           decoy: 'waves'           },
  { real: 'eye',            decoy: 'football'        },
  { real: 'ear',            decoy: 'comma'           },
  { real: 'mustache',       decoy: 'eyebrows'        },
  { real: 'skeleton',       decoy: 'ladder'          },
  { real: 'brain',          decoy: 'cloud'           },
  { real: 'tooth',          decoy: 'chess piece'     },

  // ── Clothing & accessories ────────────────────────────────────────────────
  { real: 'hat',            decoy: 'mushroom'        },
  { real: 'boot',           decoy: 'sock'            },
  { real: 'tie',            decoy: 'arrow'           },
  { real: 'bow tie',        decoy: 'hourglass'       },
  { real: 'glove',          decoy: 'mitten'          },
  { real: 'crown',          decoy: 'tiara'           },
  { real: 'high heel',      decoy: 'hockey stick'    },
  { real: 'ring',           decoy: 'circle'          },
  { real: 'necklace',       decoy: 'chain'           },

  // ── Vehicles ──────────────────────────────────────────────────────────────
  { real: 'bicycle',        decoy: 'motorcycle'      },
  { real: 'helicopter',     decoy: 'dragonfly'       },
  { real: 'hot air balloon',decoy: 'jellyfish'       },
  { real: 'canoe',          decoy: 'banana'          },
  { real: 'skateboard',     decoy: 'surfboard'       },
  { real: 'tractor',        decoy: 'tank'            },
  { real: 'spaceship',      decoy: 'iron'            },
  { real: 'ambulance',      decoy: 'bus'             },

  // ── Weather & space ───────────────────────────────────────────────────────
  { real: 'snowflake',      decoy: 'star'            },
  { real: 'tornado',        decoy: 'soft serve'      },
  { real: 'comet',          decoy: 'shooting star'   },
  { real: 'planet',         decoy: 'donut'           },
  { real: 'eclipse',        decoy: 'yin yang'        },
  { real: 'aurora',         decoy: 'rainbow'         },
  { real: 'wave',           decoy: 'hill'            },
  { real: 'island',         decoy: 'hill'            },
];

/**
 * Returns a random prompt pair, avoiding the ones used this game if possible.
 * @param {Set<number>} usedIndices - indices already used this game
 */
function pickPromptPair(usedIndices) {
  const available = PROMPT_PAIRS
    .map((p, i) => ({ ...p, i }))
    .filter(p => !usedIndices.has(p.i));

  // If we've cycled through everything, just pick fully random
  const pool = available.length > 0 ? available : PROMPT_PAIRS.map((p, i) => ({ ...p, i }));
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { real: picked.real, decoy: picked.decoy, index: picked.i };
}

module.exports = { PROMPT_PAIRS, pickPromptPair };
