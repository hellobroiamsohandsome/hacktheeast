import { createBrowserRouter } from "react-router";
import { RootLayout } from "./layouts/root-layout";
import { Dashboard } from "./pages/dashboard";
import { Flashcards } from "./pages/flashcards";
import { Stories } from "./pages/stories";
import { StoryDetail } from "./pages/story-detail";
import { Quizzes } from "./pages/quizzes";
import { QuizTaking } from "./pages/quiz-taking";
import { Profile } from "./pages/profile";
import { Login } from "./pages/login";
import { SignUp } from "./pages/signup";
import { NotFound } from "./pages/not-found";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/signup",
    Component: SignUp,
  },
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "flashcards", Component: Flashcards },
      { path: "stories", Component: Stories },
      { path: "stories/:id", Component: StoryDetail },
      { path: "quizzes", Component: Quizzes },
      { path: "quizzes/:id", Component: QuizTaking },
      { path: "profile", Component: Profile },
      { path: "*", Component: NotFound },
    ],
  },
]);