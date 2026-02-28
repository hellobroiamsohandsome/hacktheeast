import { motion } from "motion/react";
import { Link } from "react-router";
import { Play, CheckCircle2, Circle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";

export function Quizzes() {
  const quizzes = [
    {
      id: 1,
      title: "Market Vocabulary",
      description: "Test your knowledge of market and shopping terms",
      questions: 10,
      difficulty: "Beginner",
      completed: true,
      score: 85,
      progress: 100,
    },
    {
      id: 2,
      title: "Daily Routines",
      description: "Practice common phrases for everyday activities",
      questions: 12,
      difficulty: "Beginner",
      completed: false,
      progress: 60,
    },
    {
      id: 3,
      title: "Travel Essentials",
      description: "Master essential travel vocabulary and phrases",
      questions: 15,
      difficulty: "Intermediate",
      completed: true,
      score: 92,
      progress: 100,
    },
    {
      id: 4,
      title: "Food & Dining",
      description: "Learn restaurant and food-related vocabulary",
      questions: 10,
      difficulty: "Beginner",
      completed: false,
      progress: 0,
    },
    {
      id: 5,
      title: "Advanced Grammar",
      description: "Challenge yourself with complex grammatical structures",
      questions: 20,
      difficulty: "Advanced",
      completed: false,
      progress: 0,
    },
    {
      id: 6,
      title: "City Navigation",
      description: "Practice giving and understanding directions",
      questions: 12,
      difficulty: "Intermediate",
      completed: true,
      score: 78,
      progress: 100,
    },
  ];

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Beginner":
        return "text-green-700 bg-green-100";
      case "Intermediate":
        return "text-blue-700 bg-blue-100";
      case "Advanced":
        return "text-purple-700 bg-purple-100";
      default:
        return "text-gray-700 bg-gray-100";
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl mb-2 text-gray-900">Quizzes</h1>
        <p className="text-gray-600">
          Test your knowledge and track your progress
        </p>
      </motion.div>

      {/* Quizzes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {quizzes.map((quiz, index) => (
          <motion.div
            key={quiz.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-shadow"
          >
            {/* Status Badge */}
            <div className="flex items-center justify-between mb-4">
              <span
                className={`text-xs px-3 py-1 rounded-full ${getDifficultyColor(
                  quiz.difficulty
                )}`}
              >
                {quiz.difficulty}
              </span>
              {quiz.completed ? (
                <CheckCircle2 className="size-5 text-green-600" />
              ) : quiz.progress > 0 ? (
                <Circle className="size-5 text-[#3B82F6]" />
              ) : (
                <Circle className="size-5 text-gray-300" />
              )}
            </div>

            {/* Quiz Info */}
            <h3 className="text-xl mb-2 text-gray-900">{quiz.title}</h3>
            <p className="text-sm text-gray-600 mb-4 line-clamp-2">
              {quiz.description}
            </p>

            {/* Questions Count */}
            <div className="text-sm text-gray-500 mb-4">
              {quiz.questions} questions
            </div>

            {/* Progress */}
            {quiz.progress > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">Progress</span>
                  <span className="text-gray-900">
                    {quiz.completed && quiz.score ? `${quiz.score}%` : `${quiz.progress}%`}
                  </span>
                </div>
                <Progress value={quiz.progress} className="h-2" />
              </div>
            )}

            {/* Action Button */}
            <Button
              className={`w-full gap-2 ${
                quiz.completed
                  ? "bg-gray-600 hover:bg-gray-700"
                  : "bg-[#3B82F6] hover:bg-[#2563EB]"
              } text-white`}
              asChild
            >
              <Link to={`/quizzes/${quiz.id}`}>
                <Play className="size-4" />
                {quiz.completed ? "Retry Quiz" : quiz.progress > 0 ? "Continue" : "Start Quiz"}
              </Link>
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
