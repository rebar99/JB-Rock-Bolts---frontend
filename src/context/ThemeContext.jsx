import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({ theme: "light", toggle: () => { } });

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(() =>
        (typeof window !== "undefined" && localStorage.getItem("jb-theme")) || "light"
    );
    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle("dark", theme === "dark");
        localStorage.setItem("jb-theme", theme);
    }, [theme]);
    return (
        <ThemeContext.Provider value={{ theme, toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")) }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);