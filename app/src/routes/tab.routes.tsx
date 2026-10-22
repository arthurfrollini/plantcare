import React, { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddPlantSheet, type AddPlantChoice } from '../components/AddPlantSheet';
import { MyPlants } from '../pages/MyPlants';
import { Profile } from '../pages/Profile';
import { pickPhoto } from '../plants/pickPhoto';

import colors from '../styles/colors';

export type TabParamList = {
  MyPlantsList: undefined;
  AddPlant: undefined;
  Profile: undefined;
};

const AppTab = createBottomTabNavigator<TabParamList>();

// The middle tab is only a button; its screen never shows.
function Nothing() {
  return null;
}

const AuthRoutes = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { bottom } = useSafeAreaInsets();
  const [adding, setAdding] = useState(false);
  // What to do once the sheet has slid away: the camera cannot open on top of it.
  const pendingChoice = useRef<AddPlantChoice | null>(null);

  function choose(choice: AddPlantChoice) {
    pendingChoice.current = choice;
    setAdding(false);
  }

  async function runPendingChoice() {
    const choice = pendingChoice.current;
    pendingChoice.current = null;
    if (choice === 'manual') {
      navigation.navigate('Catalog');
      return;
    }
    if (choice !== 'photo') return;

    const result = await pickPhoto('camera');
    if ('photo' in result) {
      navigation.navigate('Catalog', { photo: result.photo });
    } else if ('message' in result) {
      Alert.alert(
        result.message === 'denied'
          ? t('addPlant.cameraDenied')
          : result.message === 'unsupported'
            ? t('plantForm.photoMessages.unsupported')
            : t('addPlant.cameraFailed'),
      );
    }
  }

  return (
    <>
      <AppTab.Navigator
        initialRouteName="MyPlantsList"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.green,
          tabBarInactiveTintColor: colors.heading,
          tabBarLabelPosition: 'below-icon',
          // The bar keeps the safe-area padding React Navigation adds at the bottom; the 60 px
          // above it fit the icons, the labels and the + button with room to spare.
          tabBarStyle: {
            paddingTop: 10,
            height: 70 + bottom,
          },
        }}
      >
        <AppTab.Screen
          name="MyPlantsList"
          component={MyPlants}
          options={{
            tabBarLabel: t('tabs.myPlants'),
            tabBarIcon: ({ size, color }) => (
              <MaterialCommunityIcons name="sprout-outline" size={size} color={color} />
            ),
          }}
        />

        <AppTab.Screen
          name="AddPlant"
          component={Nothing}
          options={{
            tabBarButton: () => (
              <View style={styles.addSlot}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('tabs.newPlant')}
                  style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
                  onPress={() => setAdding(true)}
                >
                  <Feather name="plus" size={26} color={colors.white} />
                </Pressable>
              </View>
            ),
          }}
        />

        <AppTab.Screen
          name="Profile"
          component={Profile}
          options={{
            tabBarLabel: t('tabs.profile'),
            tabBarIcon: ({ size, color }) => (
              <MaterialIcons name="person-outline" size={size} color={color} />
            ),
          }}
        />
      </AppTab.Navigator>

      <AddPlantSheet
        visible={adding}
        onChoose={choose}
        onClose={() => setAdding(false)}
        onClosed={() => void runPendingChoice()}
      />
    </>
  );
};

const styles = StyleSheet.create({
  // The side tabs sit at the top of their slot (React Navigation's 5 px padding), so the + is
  // pinned to the top too, at the offset that puts its centre level with theirs.
  addSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2.5,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  addButtonPressed: {
    opacity: 0.8,
  },
});

export default AuthRoutes;
