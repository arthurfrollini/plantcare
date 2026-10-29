import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { AiStatus, Checkup, UserPlant } from '@plantcare/shared';

import { getAiStatus, listCheckups, markHealed } from '../api/endpoints';
import type { PlantPhoto } from '../plants/pickPhoto';
import { CheckupBox, checkupDate } from './CheckupBox';
import { CheckupSheet } from './CheckupSheet';
import { SickPlantCard } from './SickPlantCard';
import { SymptomGuideSheet, type AiNote } from './SymptomGuideSheet';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface PlantHealthProps {
  plant: UserPlant;
  /** Tests pass a fake; the app shrinks with expo-image-manipulator. */
  shrink?: (photo: PlantPhoto) => Promise<PlantPhoto>;
}

function aiNoteFor(status: AiStatus | null): AiNote | null {
  if (!status) return null;
  if (!status.enabled) return 'off';
  return status.checkupLeft === 0 ? 'limit' : null;
}

/**
 * The plant's health on its screen: "My plant is sick" opens the symptom guide, which leads to an
 * AI check-up; the open check-up shows in the yellow box, and earlier ones collapse below it.
 */
export function PlantHealth({ plant, shrink }: PlantHealthProps) {
  const { t } = useTranslation();
  const [guideOpen, setGuideOpen] = useState(false);
  const [checkupOpen, setCheckupOpen] = useState(false);
  // A new key per check-up, so the sheet starts empty with the latest symptom filled in.
  const [checkupKey, setCheckupKey] = useState(0);
  const [prefill, setPrefill] = useState('');
  const [open, setOpen] = useState<Checkup | null>(plant.openCheckup);
  const [history, setHistory] = useState<Checkup[]>([]);
  const [pastOpen, setPastOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [healing, setHealing] = useState(false);
  // Set when the guide closes to open the check-up, which waits until the guide has slid away.
  const checkupPending = useRef(false);

  useEffect(() => {
    let current = true;
    listCheckups(plant.id)
      .then((list) => {
        if (current) setHistory(list);
      })
      .catch(() => {
        // The history stays hidden; the open check-up still shows from the plant.
      });
    getAiStatus()
      .then((status) => {
        if (current) setAiStatus(status);
      })
      .catch(() => {
        // Unknown: the AI link stays, and a check-up says what is wrong.
      });
    return () => {
      current = false;
    };
  }, [plant.id]);

  function askAi(description: string) {
    setPrefill(description);
    checkupPending.current = true;
    setGuideOpen(false);
  }

  function handleGuideClosed() {
    if (!checkupPending.current) return;
    checkupPending.current = false;
    setCheckupKey((key) => key + 1);
    setCheckupOpen(true);
  }

  function handleDone(checkup: Checkup) {
    setOpen(checkup);
    setHistory((list) => [checkup, ...list.filter((c) => c.id !== checkup.id)]);
    setCheckupOpen(false);
  }

  async function heal() {
    if (!open || healing) return;
    setHealing(true);
    try {
      const healed = await markHealed(plant.id, open.id);
      setHistory((list) => {
        const rest = list.filter((c) => c.id !== healed.id);
        return [healed, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
      setOpen(null);
    } catch {
      Alert.alert(t('health.healError'));
    } finally {
      setHealing(false);
    }
  }

  const past = history.filter((c) => c.id !== open?.id);

  return (
    <View>
      {open ? (
        <CheckupBox
          checkup={open}
          healing={healing}
          onAskAgain={() => setGuideOpen(true)}
          onHealed={() => void heal()}
        />
      ) : (
        <SickPlantCard onPress={() => setGuideOpen(true)} />
      )}

      {past.length > 0 && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: pastOpen }}
            style={({ pressed }) => [styles.pastToggle, pressed && styles.pressed]}
            onPress={() => setPastOpen((value) => !value)}
          >
            <Text style={styles.pastToggleText}>
              {t('health.pastTitle', { count: past.length })}
            </Text>
            <Feather
              name={pastOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.body_dark}
            />
          </Pressable>
          {pastOpen &&
            past.map((checkup) => (
              <View key={checkup.id} style={styles.pastRow}>
                <Text style={styles.pastDate}>
                  {checkupDate(checkup.createdAt)} ·{' '}
                  {t(checkup.status === 'healed' ? 'health.statusHealed' : 'health.statusOpen')}
                </Text>
                <Text style={styles.pastProblem}>{checkup.problem}</Text>
              </View>
            ))}
        </>
      )}

      <SymptomGuideSheet
        visible={guideOpen}
        plant={plant}
        aiNote={aiNoteFor(aiStatus)}
        onAskAi={askAi}
        onClose={() => setGuideOpen(false)}
        onClosed={handleGuideClosed}
      />
      <CheckupSheet
        key={checkupKey}
        visible={checkupOpen}
        plant={plant}
        initialDescription={prefill}
        onDone={handleDone}
        onClose={() => setCheckupOpen(false)}
        {...(shrink ? { shrink } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pastToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 10,
  },
  pressed: {
    opacity: 0.6,
  },
  pastToggleText: {
    fontSize: 15,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  pastRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray,
  },
  pastDate: {
    fontSize: 12,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  pastProblem: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 20,
    color: colors.heading,
    fontFamily: fonts.text,
  },
});
