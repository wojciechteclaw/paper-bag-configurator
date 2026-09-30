import { createContext, useContext } from 'react';

/** What an item inside the header menu can ask of it. Outside a menu (or on desktop) closing is a no-op. */
export type HeaderMenuApi = {
  /** Closes the menu (narrow screens), e.g. after an action that needs no further input from the menu. */
  close: () => void;
};

export const HeaderMenuContext = createContext<HeaderMenuApi>({ close: () => {} });

export const useHeaderMenu = (): HeaderMenuApi => useContext(HeaderMenuContext);
