import { motion } from "motion/react";
import { Link } from "react-router";
import { Clock, BookOpen, Tag } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

export function Stories() {
  const stories = [
    {
      id: 1,
      title: "A Day at the Market",
      description: "Learn food and shopping vocabulary through a vibrant market scene",
      readingTime: "3 min",
      level: "Beginner",
      vocabularyCount: 12,
      image: "https://images.unsplash.com/photo-1768722688414-27b8220b18d1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYXJrZXQlMjBzY2VuZSUyMHRyYXZlbHxlbnwxfHx8fDE3NzIyNTQwMjN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      tags: ["Food", "Shopping"],
    },
    {
      id: 2,
      title: "Morning Routine",
      description: "Practice daily activity vocabulary through a typical morning",
      readingTime: "4 min",
      level: "Beginner",
      vocabularyCount: 15,
      image: "https://images.unsplash.com/photo-1769398449496-2414ea88b441?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYWZlJTIwY29mZmVlJTIwbW9ybmluZ3xlbnwxfHx8fDE3NzIyNTQwMjN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      tags: ["Daily Life", "Routine"],
    },
    {
      id: 3,
      title: "The Library Visit",
      description: "Explore education and learning vocabulary in a library setting",
      readingTime: "5 min",
      level: "Intermediate",
      vocabularyCount: 18,
      image: "https://images.unsplash.com/photo-1662582631700-676a217d511f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsaWJyYXJ5JTIwYm9va3MlMjBzaGVsdmVzfGVufDF8fHx8MTc3MjE1NTgzMXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      tags: ["Education", "Reading"],
    },
    {
      id: 4,
      title: "Weekend Adventure",
      description: "Learn travel and outdoor vocabulary through an exciting weekend trip",
      readingTime: "6 min",
      level: "Intermediate",
      vocabularyCount: 20,
      image: "https://images.unsplash.com/photo-1686984096026-23d6e82f9749?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZXJzb24lMjBzdHVkeWluZyUyMGxhcHRvcHxlbnwxfHx8fDE3NzIxODE2OTh8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      tags: ["Travel", "Adventure"],
    },
    {
      id: 5,
      title: "At the Restaurant",
      description: "Master dining vocabulary through a restaurant experience",
      readingTime: "4 min",
      level: "Beginner",
      vocabularyCount: 14,
      image: "https://images.unsplash.com/photo-1769398449496-2414ea88b441?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYWZlJTIwY29mZmVlJTIwbW9ybmluZ3xlbnwxfHx8fDE3NzIyNTQwMjN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      tags: ["Food", "Dining"],
    },
    {
      id: 6,
      title: "City Exploration",
      description: "Navigate through city vocabulary and directions",
      readingTime: "5 min",
      level: "Intermediate",
      vocabularyCount: 16,
      image: "https://images.unsplash.com/photo-1768722688414-27b8220b18d1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYXJrZXQlMjBzY2VuZSUyMHRyYXZlbHxlbnwxfHx8fDE3NzIyNTQwMjN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      tags: ["City", "Navigation"],
    },
  ];

  const getLevelColor = (level: string) => {
    switch (level) {
      case "Beginner":
        return "bg-green-100 text-green-700";
      case "Intermediate":
        return "bg-blue-100 text-blue-700";
      case "Advanced":
        return "bg-purple-100 text-purple-700";
      default:
        return "bg-gray-100 text-gray-700";
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
        <h1 className="text-3xl mb-2 text-gray-900">Stories for You</h1>
        <p className="text-gray-600">
          Learn vocabulary in context through engaging stories
        </p>
      </motion.div>

      {/* Stories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stories.map((story, index) => (
          <motion.div
            key={story.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group"
          >
            {/* Story Image */}
            <div className="relative h-48 overflow-hidden bg-gray-200">
              <img
                src={story.image}
                alt={story.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute top-3 right-3">
                <Badge className={getLevelColor(story.level)}>
                  {story.level}
                </Badge>
              </div>
            </div>

            {/* Story Content */}
            <div className="p-5">
              <h3 className="text-xl mb-2 text-gray-900 group-hover:text-[#3B82F6] transition-colors">
                {story.title}
              </h3>
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                {story.description}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-4">
                {story.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full flex items-center gap-1"
                  >
                    <Tag className="size-3" />
                    {tag}
                  </span>
                ))}
              </div>

              {/* Meta Info */}
              <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                <div className="flex items-center gap-1">
                  <Clock className="size-4" />
                  <span>{story.readingTime}</span>
                </div>
                <div className="flex items-center gap-1">
                  <BookOpen className="size-4" />
                  <span>{story.vocabularyCount} words</span>
                </div>
              </div>

              {/* Action Button */}
              <Button
                className="w-full bg-[#3B82F6] hover:bg-[#2563EB] text-white"
                asChild
              >
                <Link to={`/stories/${story.id}`}>Read Story</Link>
              </Button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
