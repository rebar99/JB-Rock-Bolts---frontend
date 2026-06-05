let currentUser = "Admin User";

export const getCurrentUser = () => {
    try {
        const stored = localStorage.getItem("app_current_user");
        if (stored) return stored;
    } catch (e) {}
    return currentUser;
};

export const setCurrentUser = (user) => {
    currentUser = user;
    try {
        localStorage.setItem("app_current_user", user);
    } catch (e) {}
};
