-- Make the price-history logging trigger run with elevated privileges so the
-- INSERT into category_price_history doesn't get blocked by RLS.
CREATE OR REPLACE FUNCTION public.log_category_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.price_etb IS DISTINCT FROM NEW.price_etb THEN
    INSERT INTO public.category_price_history (category_id, price_etb)
    VALUES (NEW.id, NEW.price_etb);
  END IF;
  RETURN NEW;
END;
$function$;

-- Make sure the trigger actually exists (it may have been missing).
DROP TRIGGER IF EXISTS trg_log_category_price_change ON public.categories;
CREATE TRIGGER trg_log_category_price_change
AFTER INSERT OR UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.log_category_price_change();