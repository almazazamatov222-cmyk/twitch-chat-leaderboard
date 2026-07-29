export const FONT_CATEGORIES = [
  {
    name: 'Современные',
    fonts: ['Inter', 'Roboto', 'Manrope', 'Montserrat', 'Open Sans', 'Ubuntu']
  },
  {
    name: 'Жирные & Заголовочные',
    fonts: ['Oswald', 'Bebas Neue', 'Rubik', 'Russo One', 'Unbounded']
  },
  {
    name: 'Узкие (Condensed)',
    fonts: ['Roboto Condensed', 'PT Sans Narrow', 'Exo 2']
  },
  {
    name: 'Моноширинные',
    fonts: ['Fira Mono', 'JetBrains Mono', 'IBM Plex Mono']
  },
  {
    name: 'Игровые & Sci-Fi',
    fonts: ['Play', 'Jura', 'Audiowide', 'Orbitron']
  },
  {
    name: 'Пиксельные',
    fonts: ['Press Start 2P', 'Pixelify Sans']
  },
  {
    name: 'Рукописные',
    fonts: ['Caveat', 'Pacifico', 'Lobster', 'Comfortaa']
  }
];

export const getAllFonts = () => {
  return FONT_CATEGORIES.flatMap(cat => cat.fonts);
};

export const getGoogleFontsUrl = () => {
  const fonts = getAllFonts();
  // Formats: Family+Name:wght@400;700
  const families = fonts.map(f => {
    // Some fonts like Press Start 2P don't have multiple weights, but standardizing:
    if (f === 'Press Start 2P') return 'Press+Start+2P&display=swap';
    if (f === 'Pixelify Sans') return 'Pixelify+Sans:wght@400;700&display=swap';
    const formatted = f.replace(/ /g, '+');
    return `${formatted}:wght@400;500;700;900&display=swap`;
  });
  
  // Actually it's better to group them all into one API call if possible, or use a few
  // Google Fonts API v2 allows multiple family params
  const familyParams = fonts.map(f => {
    const formatted = f.replace(/ /g, '+');
    if (f === 'Press Start 2P') return `family=${formatted}`;
    return `family=${formatted}:wght@400;500;700;900`;
  }).join('&');

  return `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;
};
