export interface DemoUser {
  id: string;
  username: string;
  count: number;
}

const adjectives = [
  'Dark', 'Light', 'Pro', 'Noob', 'Super', 'Mega', 'Hyper', 'Crazy', 'Cool', 'Epic',
  'Sad', 'Happy', 'Angry', 'Fast', 'Slow', 'Red', 'Blue', 'Green', 'Yellow', 'Black',
  'White', 'Golden', 'Silver', 'Bronze', 'Magic', 'Mystic', 'Ghost', 'Ninja', 'Samurai'
];

const nouns = [
  'Gamer', 'Player', 'Slayer', 'Killer', 'Sniper', 'Healer', 'Tank', 'Mage', 'Rogue', 'Warrior',
  'King', 'Queen', 'Lord', 'Knight', 'Wizard', 'Dragon', 'Tiger', 'Lion', 'Wolf', 'Bear',
  'Fox', 'Eagle', 'Hawk', 'Falcon', 'Shark', 'Whale', 'Dolphin', 'Penguin', 'Panda'
];

export function generateDemoUsers(count: number = 50): DemoUser[] {
  const users: DemoUser[] = [];
  let baseCount = 1500;
  
  for (let i = 0; i < count; i++) {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 999);
    const username = `${adj}${noun}${num > 500 ? num : ''}`;
    
    // Decrease count to ensure sorted order
    baseCount = baseCount - Math.floor(Math.random() * 30) - 1;
    if (baseCount < 1) baseCount = 1;
    
    users.push({
      id: `demo-user-${i}`,
      username: username,
      count: baseCount
    });
  }
  
  return users;
}

export const staticDemoUsers = generateDemoUsers(50);
