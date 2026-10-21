import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CalendarTriggerInput,
  DailyTriggerInput,
  WeeklyTriggerInput,
} from 'expo-notifications';
import { format, getHours, getMinutes, getDay } from 'date-fns';
import * as Notifications from 'expo-notifications';

export interface PlantProps {
  id: string;
  name: string;
  about: string;
  water_tips: string;
  photo: string;
  environments: [string];
  frequency: {
    times: number;
    repeat_every: string;
  };
  hour: string;
  dateTimeNotification: Date;
}

export interface StoragePlantProps {
  [id: string]: {
    data: PlantProps;
    notificationId: string;
  };
}

export async function savePlant(plant: PlantProps): Promise<void> {
  try {
    const nextTime = new Date(plant.dateTimeNotification);

    const hour = getHours(nextTime);
    const minute = getMinutes(nextTime);
    const weekday = getDay(nextTime);

    const { times, repeat_every } = plant.frequency;

    const dailyTrigger: DailyTriggerInput = {
      hour,
      minute,
      repeats: true,
    };

    const weeklyTrigger: WeeklyTriggerInput = {
      hour,
      minute,
      weekday,
      repeats: true,
    };

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Heeey 🌱',
        body: `Está na hora de cuidar da sua ${plant.name}`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          plant,
        },
      },
      trigger: repeat_every === 'week' ? weeklyTrigger : dailyTrigger,
    });

    console.log(hour, minute, weekday, notificationId);
    console.log(nextTime);

    const data = await AsyncStorage.getItem('@plantcare:plants');
    const oldPlants = data ? (JSON.parse(data) as StoragePlantProps) : {};

    const newPlant = {
      [plant.id]: {
        data: plant,
        notificationId,
      },
    };

    await AsyncStorage.setItem(
      '@plantcare:plants',
      JSON.stringify({
        ...newPlant,
        ...oldPlants,
      })
    );
  } catch (err) {
    throw new Error(err);
  }
}

export async function loadPlant(): Promise<PlantProps[]> {
  try {
    const data = await AsyncStorage.getItem('@plantcare:plants');
    const plants = data ? (JSON.parse(data) as StoragePlantProps) : {};
    const plantsSorted = Object.keys(plants)
      .map((plant) => {
        return {
          ...plants[plant].data,
          hour: format(
            new Date(plants[plant].data.dateTimeNotification),
            'HH:mm'
          ),
        };
      })
      .sort((a, b) =>
        Math.floor(
          new Date(a.dateTimeNotification).getTime() / 1000 -
            Math.floor(new Date(b.dateTimeNotification).getTime() / 1000)
        )
      );

    return plantsSorted;
  } catch (err) {
    throw new Error(err);
  }
}

export async function removePlant(id: string): Promise<void> {
  const data = await AsyncStorage.getItem('@plantcare:plants');
  const plants = data ? (JSON.parse(data) as StoragePlantProps) : {};

  await Notifications.cancelScheduledNotificationAsync(
    plants[id].notificationId
  );

  delete plants[id];

  await AsyncStorage.setItem('@plantcare:plants', JSON.stringify(plants));
}
