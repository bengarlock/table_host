class Guest < ApplicationRecord
  has_many :reservations
  has_many :slots, through: :reservations


  include PgSearch
  pg_search_scope :search_content_for, against: [:first_name, :last_name, :phone_number],
                  using: { tsearch: { any_word: true } }


  def self.search_by(search_term)
    where("LOWER(first_name) LIKE :search_term
           OR LOWER(last_name) LIKE :search_term
           OR phone_number LIKE :search_term", search_term: "%#{search_term.downcase}%")
  end




end
