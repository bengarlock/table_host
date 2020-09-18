class AddReservationNotesToStotDefaultValue < ActiveRecord::Migration[6.0]
  def change
    add_column :slots, :reservation_notes, :string, default: ''
  end
end