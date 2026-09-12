import { useNavigate } from "react-router-dom";
import { Heart } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useFavorites } from "../lib/favorites";

/**
 * The heart shown on listing cards. Signed-out visitors are sent to login
 * rather than silently losing the save — a favourite belongs to an account.
 */
export function FavoriteButton({ listingId, className = "" }: { listingId: string; className?: string }) {
  const { user } = useAuth();
  const { isFavorite, toggle } = useFavorites();
  const navigate = useNavigate();
  const saved = isFavorite(listingId);

  return (
    <button
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
          navigate("/login");
          return;
        }
        void toggle(listingId);
      }}
      aria-label={saved ? "Retirer des favoris" : "Ajouter aux favoris"}
      aria-pressed={saved}
      className={`grid h-9 w-9 place-content-center rounded-full bg-white/90 shadow-sm backdrop-blur transition-colors hover:bg-white ${
        saved ? "text-[#e76f2e]" : "text-[#7a6355]"
      } ${className}`}
    >
      <Heart className={`h-[18px] w-[18px] ${saved ? "fill-current" : ""}`} aria-hidden />
    </button>
  );
}
