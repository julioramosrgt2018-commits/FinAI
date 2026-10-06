import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type Profile = 'pf' | 'pj';

const PROFILE_STORAGE_KEY = 'finai_profile';

type ProfileContextType = {
  profile: Profile;
  setProfile: (p: Profile) => void;
  toggleProfile: () => void;
  isPJ: boolean;
  isPF: boolean;
};

const ProfileContext = createContext<ProfileContextType | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<Profile>('pf');

  useEffect(() => {
    const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (saved === 'pf' || saved === 'pj') setProfileState(saved);
  }, []);

  const setProfile = useCallback((p: Profile) => {
    localStorage.setItem(PROFILE_STORAGE_KEY, p);
    setProfileState(p);
  }, []);

  const toggleProfile = useCallback(() => {
    setProfileState(prev => {
      const next = prev === 'pf' ? 'pj' : 'pf';
      localStorage.setItem(PROFILE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <ProfileContext.Provider value={{
      profile,
      setProfile,
      toggleProfile,
      isPJ: profile === 'pj',
      isPF: profile === 'pf',
    }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
