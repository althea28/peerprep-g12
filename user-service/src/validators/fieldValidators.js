export const validatePassword = (password) => {

    if (!password) {
      return "Password is required.";
    }
  
    if (password.length < 8) {
      return "Password must be at least 8 characters long.";
    }
  
    if (!/[A-Z]/.test(password)) {
      return "Password must contain at least one uppercase letter.";
    }
  
    if (!/[a-z]/.test(password)) {
      return "Password must contain at least one lowercase letter.";
    }
  
    if (!/[0-9]/.test(password)) {
      return "Password must contain at least one number.";
    }

    if (!/[!@#$%^&*()]/.test(password)) {
      return "Password must contain at least one special character (!@#$%^&*()).";
    }
  
    return null;
  };


  export const validateUsername = (username) => {

    if (!username) {
      return "Username is required.";
    }
  
    if (username.length > 20) {
      return "Username must be 20 characters or less.";
    }
  
    const usernameRegex = /^[a-z0-9_-]+$/;

    if (!usernameRegex.test(username)) {
      return "Username may only contain lowercase letters, numbers, dashes (-), and underscores (_).";
    }
  
    return null;
  };