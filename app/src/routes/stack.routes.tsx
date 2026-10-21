import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';

import Welcome from '../pages/Welcome';
import { UserIdentification } from '../pages/UserIdentification';
import { Confirmation, ConfirmationParams } from '../pages/Confirmation';
import { PlantSave } from '../pages/PlantSave';
import { Profile } from '../pages/Profile';
import AuthRoutes, { TabParamList } from './tab.routes';
import { PlantProps } from '../libs/storage';

import colors from '../styles/colors';

export type RootStackParamList = {
  Welcome: undefined;
  UserIdentification: undefined;
  Confirmation: ConfirmationParams;
  PlantSelect: NavigatorScreenParams<TabParamList> | undefined;
  PlantSave: { plant: PlantProps };
  MyPlants: NavigatorScreenParams<TabParamList> | undefined;
  Profile: undefined;
};

// Types every useNavigation() call against the routes above.
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

const stackRoutes = createNativeStackNavigator<RootStackParamList>();

const AppRoutes = () => (
  <stackRoutes.Navigator
    screenOptions={{
      headerShown: false,
      contentStyle: {
        backgroundColor: colors.white,
      },
    }}
  >
    <stackRoutes.Screen name="Welcome" component={Welcome} />
    <stackRoutes.Screen
      name="UserIdentification"
      component={UserIdentification}
    />
    <stackRoutes.Screen name="Confirmation" component={Confirmation} />
    <stackRoutes.Screen name="PlantSelect" component={AuthRoutes} />
    <stackRoutes.Screen name="PlantSave" component={PlantSave} />
    <stackRoutes.Screen name="MyPlants" component={AuthRoutes} />
    <stackRoutes.Screen name="Profile" component={Profile} />
  </stackRoutes.Navigator>
);

export default AppRoutes;
