using Microsoft.EntityFrameworkCore;
using Akiba.Models;

namespace Akiba.Data
{
    public class AkibaDbContext : DbContext
    {
        public AkibaDbContext(DbContextOptions<AkibaDbContext> options) : base(options) { }

        public DbSet<AppUser> Users => Set<AppUser>();
        public DbSet<ExpenseClass> Classes => Set<ExpenseClass>();
        public DbSet<Subject> Subjects => Set<Subject>();
        public DbSet<Transaction> Transactions => Set<Transaction>();
        public DbSet<Goal> Goals => Set<Goal>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Decimal precision has no safe default in SQLite — without this,
            // EF silently stores money as a float-like type and you get
            // rounding errors in amounts down the line.
            modelBuilder.Entity<ExpenseClass>().Property(c => c.MonthlyLimit).HasPrecision(18, 2);
            modelBuilder.Entity<Transaction>().Property(t => t.Amount).HasPrecision(18, 2);
            modelBuilder.Entity<Goal>().Property(g => g.Price).HasPrecision(18, 2);

            base.OnModelCreating(modelBuilder);
        }
    }
}