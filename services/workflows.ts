import { mockUsers, mockNotifications } from './mockData';
import { NotificationType } from '../types';

const BIRTHDAY_TITLES = [
  "Happy Birthday, {name}! 🎂",
  "Have an amazing birthday, {name}! 🎉",
  "Another year more awesome, {name}! 🎈",
  "Cheers to you, {name}! 🥳",
  "It’s your day, {name}! 🌟",
  "Sending birthday love, {name}! 💖",
  "Cake time for {name}! 🍰",
  "Level up day, {name}! 🎮✨",
  "You shine brighter today, {name}! ✨",
  "Warmest birthday wishes, {name}! 💐"
];

const BIRTHDAY_MESSAGES = [
  "Wishing you a bright year ahead filled with joy and wins at work and in life.",
  "Hope your day is packed with laughter, love, and a little bit of cake.",
  "Thank you for being such an important part of the team. Have an awesome birthday!",
  "May this year bring you new adventures, growth, and lots of happy moments.",
  "Here’s to more milestones, more memories, and more reasons to celebrate you.",
  "Wishing you a day as awesome as you are. Enjoy every minute.",
  "May your year be full of good health, great opportunities, and big smiles.",
  "Your hard work and good energy make a difference. Have a fantastic birthday today.",
  "Hope today gives you time to pause, feel appreciated, and treat yourself.",
  "Cheers to another year of learning, growing, and shining. Happy birthday!",
  "May all the good things you wish for this year find their way to you.",
  "Thanks for bringing your best self to work. Wishing you a joyful birthday!",
  "May your inbox be quiet, your heart be full, and your cake be extra sweet today.",
  "Here’s to new goals, fresh opportunities, and happy surprises all year long.",
  "You make our workplace brighter. Wishing you a day full of love and celebration.",
  "Hoping this year opens doors to new dreams and exciting moments.",
  "From all of us here, we’re grateful for you. Have a beautiful birthday.",
  "May today be the start of your favorite year yet.",
  "Wishing you peace, joy, and plenty of reasons to smile this year.",
  "Celebrate yourself today. You deserve it."
];

const getRandomItem = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const autoCelebrateBirthdays = () => {
    console.log("Running AutoCelebrateBirthdays workflow...");
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();

    const birthdayEmployees = mockUsers.filter(user => {
        if (!user.birthDate) return false;
        const birthDate = new Date(user.birthDate);
        return birthDate.getMonth() === currentMonth && birthDate.getDate() === currentDay;
    });

    if (birthdayEmployees.length === 0) {
        console.log("No birthdays today.");
        return;
    }

    console.log(`Found ${birthdayEmployees.length} birthday(s) today.`);

    birthdayEmployees.forEach(employee => {
        const firstName = employee.name.split(' ')[0];
        
        const randomTitleTemplate = getRandomItem(BIRTHDAY_TITLES);
        const randomMessage = getRandomItem(BIRTHDAY_MESSAGES);

        const title = randomTitleTemplate.replace('{name}', firstName);

        const newNotification = {
            id: `notif-bday-${employee.id}-${today.getFullYear()}`,
            userId: employee.id,
            type: NotificationType.BIRTHDAY,
            title: title,
            message: randomMessage,
            link: '/dashboard',
            isRead: false,
            createdAt: new Date(),
            relatedEntityId: employee.id,
        };
        
        // Avoid creating duplicate notifications if workflow runs multiple times in a day
        if (!mockNotifications.some(n => n.id === newNotification.id)) {
            mockNotifications.unshift(newNotification);
            console.log(`Created birthday notification for ${employee.name}.`);
        }
    });
};