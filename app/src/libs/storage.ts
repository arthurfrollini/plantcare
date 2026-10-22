import AsyncStorage from '@react-native-async-storage/async-storage';
import { DailyTriggerInput, WeeklyTriggerInput } from 'expo-notifications';
import { format, getHours, getMinutes, getDay } from 'date-fns';
import * as Notifications from 'expo-notifications';
import i18n from '../i18n';
import { ensureNotificationPermission } from '../reminders/sync';

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
    if (!(await ensureNotificationPermission())) throw new Error('Notification permission denied');

    const nextTime = new Date(plant.dateTimeNotification);

    const hour = getHours(nextTime);
    const minute = getMinutes(nextTime);
    // date-fns counts Sunday as 0; expo-notifications counts Sunday as 1.
    const weekday = getDay(nextTime) + 1;

    const { repeat_every } = plant.frequency;

    const dailyTrigger: DailyTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    };

    const weeklyTrigger: WeeklyTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      hour,
      minute,
      weekday,
    };

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t('notification.title'),
        body: i18n.t('notification.body', { name: plant.name }),
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
    throw err;
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
    throw err;
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
