import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';

import Welcome from '../pages/Welcome';
import { UserIdentification } from '../pages/UserIdentification';
import { Confirmation, ConfirmationParams } from '../pages/Confirmation';
import { PlantForm } from '../pages/PlantForm';
import { Profile } from '../pages/Profile';
import { Auth } from '../pages/Auth';
import AuthRoutes, { TabParamList } from './tab.routes';

import colors from '../styles/colors';

export type RootStackParamList = {
  Welcome: undefined;
  UserIdentification: undefined;
  Confirmation: ConfirmationParams;
  PlantSelect: NavigatorScreenParams<TabParamList> | undefined;
  PlantForm: { mode: 'create'; catalogPlantId: string } | { mode: 'edit'; userPlantId: string };
  Profile: undefined;
  Auth: { mode: 'signIn' | 'signUp'; afterAuth?: 'savePendingPlant' };
};

// Types every useNavigation() call against the routes above.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- the React Navigation typing hook is a namespace augmentation
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- React Navigation types its global route list by interface merging
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
    <stackRoutes.Screen name="PlantForm" component={PlantForm} />
    <stackRoutes.Screen name="Profile" component={Profile} />
    <stackRoutes.Screen name="Auth" component={Auth} />
  </stackRoutes.Navigator>
);

export default AppRoutes;
