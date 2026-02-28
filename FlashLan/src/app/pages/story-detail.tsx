import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft, BookmarkPlus, Check } from "lucide-react";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";

export function StoryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set());

  const story = {
    id: 1,
    title: "A Day at the Market",
    content: `It was a beautiful Saturday morning when Marie decided to visit the **marché** (market). The sun was shining brightly, and the air was filled with the **arôme** (aroma) of fresh bread and flowers.

As she walked through the bustling **allée** (aisle), she admired the colorful displays of fruits and vegetables. "**Bonjour**!" (Hello!) called out a friendly vendor, his smile as warm as the morning sun.

Marie approached a stall filled with **tomates** (tomatoes), **carottes** (carrots), and **pommes** (apples). "How much for these beautiful tomatoes?" she asked in French. "**Trois euros**" (Three euros), replied the vendor, carefully placing the fresh produce in a paper bag.

Next, she visited the **boulangerie** (bakery) section. The smell of freshly baked **pain** (bread) and **croissants** was irresistible. She purchased a warm baguette and a few pastries for breakfast.

As Marie continued her **promenade** (stroll), she encountered a flower vendor selling beautiful **fleurs** (flowers). She chose a bouquet of **roses** (roses) and **tulipes** (tulips) to brighten her apartment.

The market was alive with **conversations** (conversations) in French, creating a symphony of sounds. Marie felt grateful for this **expérience** (experience), which allowed her to practice her language skills while enjoying the local culture.

With her bags full of fresh produce and treats, Marie headed home, already looking forward to her next market **aventure** (adventure).`,
    vocabularyWords: [
      { word: "marché", translation: "market", count: 3 },
      { word: "arôme", translation: "aroma", count: 1 },
      { word: "allée", translation: "aisle", count: 1 },
      { word: "bonjour", translation: "hello", count: 1 },
      { word: "tomates", translation: "tomatoes", count: 2 },
      { word: "carottes", translation: "carrots", count: 1 },
      { word: "pommes", translation: "apples", count: 1 },
      { word: "trois euros", translation: "three euros", count: 1 },
      { word: "boulangerie", translation: "bakery", count: 1 },
      { word: "pain", translation: "bread", count: 1 },
      { word: "croissants", translation: "croissants", count: 1 },
      { word: "promenade", translation: "stroll", count: 1 },
      { word: "fleurs", translation: "flowers", count: 2 },
      { word: "roses", translation: "roses", count: 1 },
      { word: "tulipes", translation: "tulips", count: 1 },
      { word: "conversations", translation: "conversations", count: 1 },
      { word: "expérience", translation: "experience", count: 1 },
      { word: "aventure", translation: "adventure", count: 1 },
    ],
  };

  const handleSaveWord = (word: string, translation: string) => {
    setSavedWords((prev) => new Set([...prev, word]));
    toast.success(`"${word}" saved to flashcards! 🎉`);
  };

  const renderContent = () => {
    const regex = /\*\*(.*?)\*\*/g;
    const parts = story.content.split(regex);

    return parts.map((part, index) => {
      // Check if this is a vocabulary word (odd indices after split)
      if (index % 2 === 1) {
        const vocabWord = story.vocabularyWords.find(
          (v) => v.word.toLowerCase() === part.toLowerCase()
        );
        return (
          <TooltipProvider key={index}>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <span className="text-[#3B82F6] font-medium cursor-help underline decoration-dotted hover:bg-[#3B82F6]/10 px-1 rounded transition-colors">
                  {part}
                </span>
              </TooltipTrigger>
              <TooltipContent className="bg-white border border-gray-200 shadow-lg p-3 max-w-xs">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-gray-900 mb-1">{part}</div>
                    <div className="text-xs text-gray-600">
                      {vocabWord?.translation}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() =>
                      handleSaveWord(part, vocabWord?.translation || "")
                    }
                    disabled={savedWords.has(part)}
                  >
                    {savedWords.has(part) ? (
                      <Check className="size-4 text-green-600" />
                    ) : (
                      <BookmarkPlus className="size-4" />
                    )}
                  </Button>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Progress Bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <Progress value={progress} className="h-1 rounded-none" />
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Button
            variant="ghost"
            className="mb-6 gap-2"
            onClick={() => navigate("/stories")}
          >
            <ArrowLeft className="size-4" />
            Back to Stories
          </Button>
        </motion.div>

        {/* Story Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl mb-4 text-gray-900">{story.title}</h1>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>3 min read</span>
            <span>•</span>
            <span>18 vocabulary words</span>
            <span>•</span>
            <span className="text-[#3B82F6]">Beginner</span>
          </div>
        </motion.div>

        {/* Story Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="prose prose-lg max-w-none mb-12"
        >
          <div className="text-gray-700 leading-relaxed whitespace-pre-line">
            {renderContent()}
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="border-t border-gray-200 pt-8 flex flex-col sm:flex-row gap-4"
        >
          <Button
            className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2"
            onClick={() => {
              setProgress(100);
              toast.success("Story marked as read! 📚");
            }}
          >
            <Check className="size-4" />
            Mark as Read
          </Button>
          <Button
            className="flex-1 bg-[#3B82F6] hover:bg-[#2563EB] text-white"
            onClick={() => navigate("/quizzes")}
          >
            Take a Quiz
          </Button>
        </motion.div>

        {/* Vocabulary Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-12 bg-gray-50 rounded-xl p-6"
        >
          <h3 className="text-xl mb-4 text-gray-900">Vocabulary in this story</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {story.vocabularyWords.slice(0, 8).map((word) => (
              <div
                key={word.word}
                className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200"
              >
                <div>
                  <div className="text-sm text-gray-900">{word.word}</div>
                  <div className="text-xs text-gray-600">{word.translation}</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleSaveWord(word.word, word.translation)}
                  disabled={savedWords.has(word.word)}
                >
                  {savedWords.has(word.word) ? (
                    <Check className="size-4 text-green-600" />
                  ) : (
                    <BookmarkPlus className="size-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
