import { Link } from "react-router";
import { motion } from "motion/react";
import { CreditCard, BookOpen, FileText, Target, TrendingUp, Flame, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";

export function Dashboard() {
  const stats = [
    { label: "Total Flashcards", value: 47, icon: CreditCard, color: "bg-[#3B82F6]" },
    { label: "Stories Available", value: 12, icon: BookOpen, color: "bg-[#14B8A6]" },
    { label: "Quizzes Completed", value: 8, icon: FileText, color: "bg-[#F97316]" },
  ];

  const recentWords = [
    { word: "bonjour", translation: "hello", language: "French" },
    { word: "bibliothèque", translation: "library", language: "French" },
    { word: "merci", translation: "thank you", language: "French" },
    { word: "aventure", translation: "adventure", language: "French" },
  ];

  const recommendations = [
    {
      id: 1,
      title: "A Day at the Market",
      type: "Story",
      description: "Practice your food vocabulary",
      tag: "Beginner",
    },
    {
      id: 2,
      title: "Travel Essentials",
      type: "Quiz",
      description: "Test your travel phrases",
      tag: "Intermediate",
    },
    {
      id: 3,
      title: "Morning Routine",
      type: "Story",
      description: "Learn daily activity words",
      tag: "Beginner",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl text-gray-900">Welcome back, Alex!</h1>
          <Sparkles className="size-6 text-[#FBBF24]" />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[#F97316]">
            <Flame className="size-5" />
            <span>7 day streak</span>
          </div>
          <div className="text-gray-600">
            You've learned <span className="text-[#3B82F6]">25 words</span> this week
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="size-6 text-white" />
                </div>
                <TrendingUp className="size-5 text-green-500" />
              </div>
              <div className="text-3xl mb-1 text-gray-900">{stat.value}</div>
              <div className="text-sm text-gray-600">{stat.label}</div>
            </motion.div>
          );
        })}
      </div>

      {/* Daily Goal Progress */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-8"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#FBBF24]/10 p-3 rounded-lg">
              <Target className="size-6 text-[#FBBF24]" />
            </div>
            <div>
              <h3 className="text-gray-900">Daily Goal Progress</h3>
              <p className="text-sm text-gray-600">8 / 10 flashcards reviewed</p>
            </div>
          </div>
          <span className="text-2xl text-gray-900">80%</span>
        </div>
        <Progress value={80} className="h-3" />
        <p className="text-sm text-gray-600 mt-2">Keep it up! Just 2 more to reach your goal today.</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl text-gray-900">Recent Activity</h2>
            <Link to="/flashcards" className="text-[#3B82F6] text-sm hover:underline">
              View all
            </Link>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
            {recentWords.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xl mb-1 text-gray-900">{item.word}</div>
                    <div className="text-sm text-gray-600">{item.translation}</div>
                  </div>
                  <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                    {item.language}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Recommended for You */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h2 className="text-xl mb-4 text-gray-900">Recommended for You</h2>
          <div className="space-y-4">
            {recommendations.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + index * 0.1 }}
                className="bg-white rounded-xl shadow-sm p-4 border border-gray-200 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="mb-1 text-gray-900">{item.title}</h3>
                    <p className="text-sm text-gray-600">{item.description}</p>
                  </div>
                  <span className="text-xs bg-[#3B82F6]/10 text-[#3B82F6] px-3 py-1 rounded-full whitespace-nowrap">
                    {item.tag}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-gray-500">{item.type}</span>
                  <Button
                    size="sm"
                    className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
                    asChild
                  >
                    <Link to={item.type === "Story" ? "/stories" : "/quizzes"}>
                      Start
                    </Link>
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* CTA Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        className="mt-8 text-center"
      >
        <Button
          size="lg"
          className="bg-gradient-to-r from-[#3B82F6] to-[#14B8A6] hover:opacity-90 text-white px-8"
          asChild
        >
          <Link to="/flashcards">Review 5 Flashcards Now</Link>
        </Button>
      </motion.div>
    </div>
  );
}
