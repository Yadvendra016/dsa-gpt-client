import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import api, { isAuthenticated } from "../utils/auth";

const ProtectedRoute = ({ component: Component, ...rest }) => {
  const [authChecked, setAuthChecked] = useState(false);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    const validateToken = async () => {
      // First check if we have a token at all
      if (!isAuthenticated()) {
        setAuthChecked(true);
        return;
      }

      // Then verify the token with the backend
      try {
        await api.get("/api/me");
        setIsValid(true);
      } catch (error) {
        console.log(
          "Auth validation failed:",
          error.response?.data || error.message
        );
        // If token is invalid, clear it
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      } finally {
        setAuthChecked(true);
      }
    };

    validateToken();
  }, []);

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  return isValid ? <Component {...rest} /> : <Navigate to="/login" />;
};

export default ProtectedRoute;
