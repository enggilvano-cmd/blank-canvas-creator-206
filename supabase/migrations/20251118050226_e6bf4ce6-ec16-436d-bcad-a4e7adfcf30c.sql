-- Create period_closures table
CREATE TABLE public.period_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  closure_type TEXT NOT NULL CHECK (closure_type IN ('monthly', 'annual')),
  closed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_by UUID NOT NULL,
  unlocked_at TIMESTAMP WITH TIME ZONE,
  unlocked_by UUID,
  is_locked BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_start, period_end)
);

-- Enable RLS
ALTER TABLE public.period_closures ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own period closures"
  ON public.period_closures FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own period closures"
  ON public.period_closures FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own period closures"
  ON public.period_closures FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own period closures"
  ON public.period_closures FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_period_closures_updated_at
  BEFORE UPDATE ON public.period_closures
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to check if a date is in a locked period
CREATE OR REPLACE FUNCTION public.is_period_locked(p_user_id UUID, p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.period_closures
    WHERE user_id = p_user_id
      AND p_date >= period_start
      AND p_date <= period_end
      AND is_locked = true
  );
$$;

-- Create indexes for performance
CREATE INDEX idx_period_closures_user_id ON public.period_closures(user_id);
CREATE INDEX idx_period_closures_dates ON public.period_closures(user_id, period_start, period_end);
CREATE INDEX idx_period_closures_locked ON public.period_closures(user_id, is_locked);